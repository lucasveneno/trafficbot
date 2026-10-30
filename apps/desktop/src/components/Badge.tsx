/** Inline status badge — maps value to color class */
export function Badge({ value }: { value: string }) {
  return (
    <span className={`badge ${value}`}>
      <i />
      {value}
    </span>
  )
}
