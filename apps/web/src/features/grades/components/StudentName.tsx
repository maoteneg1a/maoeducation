/** En móvil ocupa una columna corta; un toque despliega el nombre completo. */
export function StudentName({ lastName, firstName }: { lastName: string; firstName: string }) {
  const fullName = `${lastName}, ${firstName}`
  const surname = lastName.trim().split(/\s+/)[0] || '—'
  const initial = firstName.trim().slice(0, 1)
  return <>
    <span className="hidden md:inline">{fullName}</span>
    <details className="w-24 whitespace-normal md:hidden">
      <summary aria-label={`Ver nombre completo: ${fullName}`} title={fullName} className="cursor-pointer list-none truncate text-xs underline decoration-dotted decoration-muted-foreground/50 underline-offset-4 [&::-webkit-details-marker]:hidden">{surname}{initial ? ` ${initial}.` : ''}</summary>
      <p className="mt-1 break-words text-xs font-normal text-muted-foreground">{fullName}</p>
    </details>
  </>
}
