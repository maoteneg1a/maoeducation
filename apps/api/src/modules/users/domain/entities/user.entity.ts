export interface UserListItem {
  id: string
  email: string
  isActive: boolean
  roles: string[]
  firstName: string
  lastName: string
  dni: string | null
  phone: string | null
  fullName: string
  avatarUrl: string | null
  createdAt: Date
}

export interface UserDetail extends UserListItem {
  institutionId: string
  profile: {
    firstName: string
    lastName: string
    dni: string | null
    phone: string | null
    birthDate: Date | null
    phoneAlt: string | null
    address: string | null
    occupation: string | null
    nationality: string | null
    placeOfBirth: string | null
    bloodType: string | null
    gender: string | null
    emergencyContactName: string | null
    emergencyContactPhone: string | null
  } | null
}
