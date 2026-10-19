import { buildCommitmentDocument, parseCommitmentInput, resolveActaTemplate, type ActaContext, type CommitmentDocument } from '../../application/services/commitment-document'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { ConflictError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import type {
  AddEventDto,
  AssignDeceDto,
  ChangeStateDto,
  CreateCommitmentDto,
  CreateIncidentDto,
  CreateIncidentTypeDto,
  ListIncidentsQuery,
  UpdateIncidentDto,
  UpdateIncidentTypeDto,
} from '../../application/dtos/incident.dto'

const personSelect = {
  id: true,
  profile: { select: { firstName: true, lastName: true, dni: true } },
}

const listRelations = {
  student: { select: personSelect },
  reporter: { select: personSelect },
  incidentType: { select: { id: true, name: true, severity: true } },
  assignedDece: { select: personSelect },
}

const detailRelations = {
  ...listRelations,
  events: {
    orderBy: { createdAt: 'asc' as const },
    include: { actor: { select: personSelect } },
  },
  commitments: {
    orderBy: { createdAt: 'desc' as const },
    include: { creator: { select: personSelect } },
  },
  attachments: {
    orderBy: { createdAt: 'desc' as const },
    include: { uploader: { select: personSelect } },
  },
}

function fullName(p: { profile: { firstName: string; lastName: string } | null } | null, fallback = ''): string {
  if (!p?.profile) return fallback
  return `${p.profile.firstName} ${p.profile.lastName}`.trim()
}

/** Actor autenticado, derivado del JWT (req.user). */
export interface IncidentActor {
  userId: string
  roles: string[]
  permissions: string[]
}

export class PrismaIncidentRepository {
  // ─── Scope (visibilidad) ─────────────────────────────────────────────────
  /**
   * ¿El actor puede ver TODOS los incidentes de la institución?
   * admin, o cualquier permiso de incidents con scope `all`
   * (incidents:read:all / write:all / manage:all).
   */
  private hasAllScope(actor: IncidentActor): boolean {
    if (actor.roles.includes('admin') || actor.roles.includes('rector')) return true
    return actor.permissions.some((p) => {
      const [resource, action, scope] = p.split(':')
      const resourceMatch = resource === 'incidents' || resource === '*'
      const actionMatch = action === 'read' || action === 'write' || action === 'manage'
      return resourceMatch && actionMatch && scope === 'all'
    })
  }

  /**
   * Ids de los estudiantes "propios" del actor para scope `own`:
   * - student   → él mismo.
   * - guardian  → sus representados (guardian_students).
   * - teacher   → estudiantes matriculados en los paralelos de sus asignaciones.
   */
  private async ownedStudentIds(institutionId: string, actor: IncidentActor): Promise<string[]> {
    const ids = new Set<string>()

    if (actor.roles.includes('student')) ids.add(actor.userId)

    if (actor.roles.includes('guardian')) {
      const links = await prisma.guardianStudent.findMany({
        where: { guardianId: actor.userId },
        select: { studentId: true },
      })
      links.forEach((l) => ids.add(l.studentId))
    }

    if (actor.roles.includes('teacher')) {
      const assignments = await prisma.courseAssignment.findMany({
        where: { institutionId, teacherId: actor.userId },
        select: { parallelId: true, academicYearId: true },
      })
      if (assignments.length > 0) {
        const enrollments = await prisma.studentEnrollment.findMany({
          where: {
            institutionId,
            OR: assignments.map((a) => ({ parallelId: a.parallelId, academicYearId: a.academicYearId })),
          },
          select: { studentId: true },
        })
        enrollments.forEach((e) => ids.add(e.studentId))
      }
    }

    return [...ids]
  }

  /** Condición Prisma que limita los incidentes visibles bajo scope `own`. */
  private async ownScopeWhere(
    institutionId: string,
    actor: IncidentActor,
  ): Promise<Prisma.DisciplinaryIncidentWhereInput> {
    const studentIds = await this.ownedStudentIds(institutionId, actor)
    const or: Prisma.DisciplinaryIncidentWhereInput[] = [{ reportedBy: actor.userId }]
    if (studentIds.length > 0) or.push({ studentId: { in: studentIds } })
    return { OR: or }
  }

  // ─── Estudiantes reportables ──────────────────────────────────────────────
  /**
   * Estudiantes sobre los que el actor puede registrar un incidente:
   * - admin/inspector/dece/rector → todos los estudiantes de la institución.
   * - teacher → solo los matriculados en los paralelos de sus asignaciones.
   */
  async listReportableStudents(
    institutionId: string,
    actor: { userId: string; roles: string[] },
  ): Promise<Array<{ id: string; fullName: string; dni: string | null }>> {
    const isAdminLike = actor.roles.some((r) =>
      ['admin', 'inspector', 'dece', 'rector', 'autoridad'].includes(r),
    )

    let students: Array<{ id: string; profile: { firstName: string; lastName: string; dni: string | null } | null }>

    if (isAdminLike) {
      students = await prisma.user.findMany({
        where: { institutionId, userRoles: { some: { role: { name: 'student' } } } },
        select: personSelect,
      })
    } else {
      // Docente: estudiantes matriculados en los paralelos de sus asignaciones
      const assignments = await prisma.courseAssignment.findMany({
        where: { institutionId, teacherId: actor.userId },
        select: { parallelId: true, academicYearId: true },
      })
      if (assignments.length === 0) return []

      const enrollments = await prisma.studentEnrollment.findMany({
        where: {
          institutionId,
          OR: assignments.map((a) => ({ parallelId: a.parallelId, academicYearId: a.academicYearId })),
        },
        select: { student: { select: personSelect } },
      })
      const byId = new Map(enrollments.map((e) => [e.student.id, e.student]))
      students = [...byId.values()]
    }

    return students
      .map((s) => ({ id: s.id, fullName: fullName(s), dni: s.profile?.dni ?? null }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
  }

  // ─── Incidentes (caso) ──────────────────────────────────────────────────

  async list(institutionId: string, query: ListIncidentsQuery, actor: IncidentActor) {
    const scopeWhere = this.hasAllScope(actor)
      ? {}
      : await this.ownScopeWhere(institutionId, actor)

    return prisma.disciplinaryIncident.findMany({
      where: {
        institutionId,
        ...(query.studentId && { studentId: query.studentId }),
        ...(query.status && { status: query.status }),
        ...(query.severity && { severity: query.severity }),
        ...(query.workflowState && { workflowState: query.workflowState }),
        ...scopeWhere,
      },
      include: listRelations,
      orderBy: { createdAt: 'desc' },
    })
  }

  async create(institutionId: string, dto: CreateIncidentDto, reportedById: string) {
    const student = await prisma.user.findFirst({ where: { id: dto.studentId, institutionId } })
    if (!student) throw new NotFoundError('Estudiante no encontrado')

    return prisma.$transaction(async (tx) => {
      const incident = await tx.disciplinaryIncident.create({
        data: {
          institutionId,
          studentId: dto.studentId,
          reportedBy: reportedById,
          incidentTypeId: dto.incidentTypeId ?? null,
          incidentDate: new Date(dto.incidentDate),
          category: dto.category,
          description: dto.description,
          severity: dto.severity ?? 'leve',
        },
        include: detailRelations,
      })
      await tx.incidentEvent.create({
        data: {
          incidentId: incident.id,
          institutionId,
          actorId: reportedById,
          type: 'created',
          description: 'Incidente reportado',
        },
      })
      return incident
    })
  }

  async update(id: string, institutionId: string, dto: UpdateIncidentDto) {
    await this.ensureExists(id, institutionId)
    return prisma.disciplinaryIncident.update({
      where: { id },
      data: {
        ...(dto.incidentTypeId !== undefined && { incidentTypeId: dto.incidentTypeId }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.severity !== undefined && { severity: dto.severity }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.resolutionNotes !== undefined && { resolutionNotes: dto.resolutionNotes }),
        ...(dto.status === 'resolved' && { resolvedAt: new Date() }),
      },
      include: detailRelations,
    })
  }

  async getById(id: string, institutionId: string, actor?: IncidentActor) {
    const incident = await prisma.disciplinaryIncident.findFirst({
      where: { id, institutionId },
      include: detailRelations,
    })
    if (!incident) throw new NotFoundError('Incidente no encontrado')

    // Scope `own`: solo se puede ver el detalle de un incidente propio.
    if (actor && !this.hasAllScope(actor)) {
      const studentIds = await this.ownedStudentIds(institutionId, actor)
      const canView = incident.reportedBy === actor.userId || studentIds.includes(incident.studentId)
      if (!canView) throw new NotFoundError('Incidente no encontrado')
    }
    return incident
  }

  async changeState(id: string, institutionId: string, actorId: string, dto: ChangeStateDto) {
    await this.ensureExists(id, institutionId)
    return prisma.$transaction(async (tx) => {
      const incident = await tx.disciplinaryIncident.update({
        where: { id },
        data: {
          workflowState: dto.workflowState,
          ...(dto.workflowState === 'resuelto' && { resolvedAt: new Date() }),
        },
        include: detailRelations,
      })
      await tx.incidentEvent.create({
        data: {
          incidentId: id,
          institutionId,
          actorId,
          type: 'state_changed',
          description: dto.note ?? `Estado cambiado a "${dto.workflowState}"`,
          metadata: { workflowState: dto.workflowState },
        },
      })
      return incident
    })
  }

  async assignDece(id: string, institutionId: string, actorId: string, dto: AssignDeceDto) {
    await this.ensureExists(id, institutionId)
    const dece = await prisma.user.findFirst({
      where: { id: dto.deceId, institutionId },
      include: { profile: { select: { firstName: true, lastName: true } } },
    })
    if (!dece) throw new NotFoundError('Profesional DECE no encontrado')

    return prisma.$transaction(async (tx) => {
      const incident = await tx.disciplinaryIncident.update({
        where: { id },
        data: {
          assignedDeceId: dto.deceId,
          assignedDeceAt: new Date(),
          workflowState: 'derivado_dece',
        },
        include: detailRelations,
      })
      const name = dece.profile ? `${dece.profile.firstName} ${dece.profile.lastName}` : 'DECE'
      await tx.incidentEvent.create({
        data: {
          incidentId: id,
          institutionId,
          actorId,
          type: 'dece_assigned',
          description: dto.note ?? `Caso derivado al DECE (${name})`,
          metadata: { deceId: dto.deceId },
        },
      })
      return incident
    })
  }

  async addEvent(id: string, institutionId: string, actorId: string, dto: AddEventDto) {
    await this.ensureExists(id, institutionId)
    return prisma.incidentEvent.create({
      data: { incidentId: id, institutionId, actorId, type: 'note', description: dto.description },
      include: { actor: { select: personSelect } },
    })
  }

  async listEvents(id: string, institutionId: string) {
    await this.ensureExists(id, institutionId)
    return prisma.incidentEvent.findMany({
      where: { incidentId: id },
      include: { actor: { select: personSelect } },
      orderBy: { createdAt: 'asc' },
    })
  }

  async markGuardianNotified(id: string, institutionId: string, actorId: string, summary: string) {
    return prisma.$transaction(async (tx) => {
      await tx.disciplinaryIncident.update({
        where: { id },
        data: { guardianNotifiedAt: new Date() },
      })
      await tx.incidentEvent.create({
        data: { incidentId: id, institutionId, actorId, type: 'guardian_notified', description: summary },
      })
    })
  }

  // ─── Actas de compromiso ────────────────────────────────────────────────

  private async actaContext(tx: Prisma.TransactionClient, id: string, institutionId: string) {
    const incident = await tx.disciplinaryIncident.findFirst({
      where: { id, institutionId },
      include: { ...listRelations, events: detailRelations.events, attachments: detailRelations.attachments },
    })
    if (!incident) throw new NotFoundError('Incidente no encontrado')
    const institution = await tx.institution.findUnique({ where: { id: institutionId }, select: { name: true, settings: true } })
    if (!institution) throw new NotFoundError('Institución no encontrada')
    const enrollment = await tx.studentEnrollment.findFirst({
      where: { institutionId, studentId: incident.studentId, academicYear: { startDate: { lte: incident.incidentDate }, endDate: { gte: incident.incidentDate } } },
      include: { parallel: { include: { level: true } }, academicYear: true },
    })
    const guardians = await tx.guardianStudent.findMany({
      where: { studentId: incident.studentId, guardian: { institutionId } },
      include: { guardian: { select: personSelect } },
    })
    const settings = (institution.settings ?? {}) as { branding?: { logoUrl?: string } }
    const context: ActaContext = {
      institutionName: institution.name, logoUrl: settings.branding?.logoUrl ?? null, incidentId: incident.id,
      studentName: fullName(incident.student, 'No registrado'), studentDni: incident.student.profile?.dni ?? null,
      classroom: enrollment ? `${enrollment.parallel.level.name} ${enrollment.parallel.name} · ${enrollment.academicYear.name}` : null,
      guardians: guardians.map((link) => ({ name: fullName(link.guardian, 'No registrado'), dni: link.guardian.profile?.dni ?? null, relationship: link.relationship })),
      incidentDate: incident.incidentDate.toISOString().slice(0, 10), incidentTypeName: incident.incidentType?.name ?? incident.category,
      severity: incident.incidentType?.severity ?? incident.severity, description: incident.description, workflowState: incident.workflowState,
      reporterName: fullName(incident.reporter, 'No registrado'), assignedDeceName: incident.assignedDece ? fullName(incident.assignedDece) : null,
      guardianNotifiedAt: incident.guardianNotifiedAt?.toISOString() ?? null, resolutionNotes: incident.resolutionNotes,
      timeline: incident.events.map((event) => ({ id: event.id, type: event.type, description: event.description, createdAt: event.createdAt.toISOString(), actorName: fullName(event.actor, 'No registrado') })),
      evidence: incident.attachments.map((attachment) => ({ id: attachment.id, fileName: attachment.fileName, createdAt: attachment.createdAt.toISOString(), uploaderName: fullName(attachment.uploader, 'No registrado') })),
    }
    return { context, template: resolveActaTemplate(institution.settings) }
  }

  async createCommitment(id: string, institutionId: string, actorId: string, dto: CreateCommitmentDto) {
    const input = parseCommitmentInput(dto)
    return prisma.$transaction(async (tx) => {
      const { context, template } = await this.actaContext(tx, id, institutionId)
      const document = buildCommitmentDocument(context, template, input.document)
      document.generalTerms = input.terms
      document.followUpDate = input.followUpDate ?? null
      const terms = input.terms || document.details.agreements.map((agreement, index) => `${index + 1}. ${agreement.action} — Responsable: ${agreement.responsible}`).join('\n')
      const commitment = await tx.incidentCommitment.create({
        data: {
          incidentId: id, institutionId, terms,
          followUpDate: input.followUpDate ? new Date(input.followUpDate) : null,
          signatories: (input.signatories ?? {}) as Prisma.InputJsonValue,
          documentData: document as unknown as Prisma.InputJsonValue, createdBy: actorId,
        },
        include: { creator: { select: personSelect } },
      })
      await tx.incidentEvent.create({
        data: { incidentId: id, institutionId, actorId, type: 'commitment_created', description: 'Acta de compromiso creada', metadata: { commitmentId: commitment.id } },
      })
      return commitment
    }, { timeout: 20_000 })
  }

  async listCommitments(id: string, institutionId: string) {
    await this.ensureExists(id, institutionId)
    return prisma.incidentCommitment.findMany({
      where: { incidentId: id },
      include: { creator: { select: personSelect } },
      orderBy: { createdAt: 'desc' },
    })
  }

  /** Carga el acta + datos necesarios para el PDF. */
  async getCommitmentForPdf(incidentId: string, commitmentId: string, institutionId: string) {
    const commitment = await prisma.incidentCommitment.findFirst({
      where: { id: commitmentId, incidentId, institutionId },
      include: {
        creator: { select: personSelect },
        incident: {
          include: {
            student: { select: personSelect },
            incidentType: { select: { name: true, severity: true } },
          },
        },
        institution: { select: { name: true, settings: true } },
      },
    })
    if (!commitment) throw new NotFoundError('Acta no encontrada')
    if (commitment.documentData) {
      return { ...commitment, document: commitment.documentData as unknown as CommitmentDocument, contextIsCurrent: false }
    }
    const current = await prisma.$transaction(async (tx) => this.actaContext(tx, incidentId, institutionId), { timeout: 20_000 })
    return { ...commitment, document: buildCommitmentDocument(current.context, current.template), contextIsCurrent: true }
  }

  // ─── Evidencias ─────────────────────────────────────────────────────────

  async addAttachment(
    id: string,
    institutionId: string,
    actorId: string,
    file: { fileName: string; storedName: string; mimeType: string; fileSize: number },
  ) {
    await this.ensureExists(id, institutionId)
    return prisma.$transaction(async (tx) => {
      const attachment = await tx.incidentAttachment.create({
        data: {
          incidentId: id,
          institutionId,
          fileName: file.fileName,
          storedName: file.storedName,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
          uploadedBy: actorId,
        },
        include: { uploader: { select: personSelect } },
      })
      await tx.incidentEvent.create({
        data: {
          incidentId: id,
          institutionId,
          actorId,
          type: 'attachment_added',
          description: `Evidencia adjuntada: ${file.fileName}`,
        },
      })
      return attachment
    })
  }

  async findAttachment(attachmentId: string, institutionId: string) {
    return prisma.incidentAttachment.findFirst({ where: { id: attachmentId, institutionId } })
  }

  async deleteAttachment(attachmentId: string) {
    await prisma.incidentAttachment.delete({ where: { id: attachmentId } })
  }

  // ─── Tipos de falta (catálogo) ──────────────────────────────────────────

  async listTypes(institutionId: string) {
    return prisma.incidentType.findMany({
      where: { institutionId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  }

  async createType(institutionId: string, dto: CreateIncidentTypeDto) {
    const existing = await prisma.incidentType.findFirst({ where: { institutionId, name: dto.name } })
    if (existing) throw new ConflictError(`Ya existe un tipo de falta con el nombre "${dto.name}"`)

    const base = dto.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 50)
    const codeConflict = await prisma.incidentType.findFirst({ where: { institutionId, code: base } })
    const code = codeConflict ? `${base}_${Date.now()}`.slice(0, 50) : base

    return prisma.incidentType.create({
      data: {
        institutionId,
        name: dto.name,
        code,
        severity: dto.severity ?? 'leve',
        description: dto.description,
        requiresDece: dto.requiresDece ?? false,
        requiresCommitment: dto.requiresCommitment ?? false,
      },
    })
  }

  async updateType(id: string, institutionId: string, dto: UpdateIncidentTypeDto) {
    const type = await prisma.incidentType.findFirst({ where: { id, institutionId } })
    if (!type) throw new NotFoundError('Tipo de falta no encontrado')
    return prisma.incidentType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.severity !== undefined && { severity: dto.severity }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.requiresDece !== undefined && { requiresDece: dto.requiresDece }),
        ...(dto.requiresCommitment !== undefined && { requiresCommitment: dto.requiresCommitment }),
      },
    })
  }

  async toggleType(id: string, institutionId: string) {
    const type = await prisma.incidentType.findFirst({ where: { id, institutionId } })
    if (!type) throw new NotFoundError('Tipo de falta no encontrado')
    return prisma.incidentType.update({ where: { id }, data: { isActive: !type.isActive } })
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Ids de los guardians (representantes) de un estudiante. */
  async getStudentGuardianIds(studentId: string): Promise<string[]> {
    const links = await prisma.guardianStudent.findMany({
      where: { studentId },
      select: { guardianId: true },
    })
    return links.map((l) => l.guardianId)
  }

  private async ensureExists(id: string, institutionId: string) {
    const existing = await prisma.disciplinaryIncident.findFirst({ where: { id, institutionId } })
    if (!existing) throw new NotFoundError('Incidente no encontrado')
    return existing
  }
}
