// Green "something happened" banner on a role home after an action redirect
// (?done=..., Leave Request design §4–§5). Unknown tokens render nothing.
const BANNERS: Record<string, string> = {
  submitted: 'Request submitted.',
  withdrawn: 'Request withdrawn.',
  signed: 'Request signed.',
  rejected: 'Request rejected.',
  sent: 'Sent to HR.',
  approved: 'Request approved.',
}

export function SuccessBanner({ done }: { done?: string }) {
  const text = done ? BANNERS[done] : undefined
  if (!text) return null
  return (
    <p
      role="status"
      className="mb-6 rounded-2xl border border-[#23a55a]/30 bg-[#23a55a]/10 px-5 py-3 text-sm font-medium text-[#1c8b4b]"
    >
      {text}
    </p>
  )
}
