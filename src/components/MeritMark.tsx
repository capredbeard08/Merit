export default function MeritMark({ size = 44, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      aria-label="MERIT insignia"
      role="img"
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M60 8 L27 73 C23 81 17 86 8 86 H25 C33 86 38 82 42 74 L60 40 L77 73 C81 81 87 86 96 86 H112 L75 13 C71 5 65 5 60 8Z" fill="currentColor" />
      <path d="M60 8 L60 39 L42 74 C38 82 33 86 25 86 H8 L27 73 L60 8Z" fill="currentColor" />
      <path d="M68 14 L68 42 L84 74 C88 82 94 86 103 86 H112 L75 13 C73 9 70 10 68 14Z" fill="currentColor" />
      <path d="M45 81 L59 55 L72 81 C76 89 83 94 93 94 H102 L87 105 H18 L32 94 C37 91 41 87 45 81Z" fill="currentColor" />
      <path d="M60 8 L60 39 L42 74 C38 82 33 86 25 86 H8 L27 73 L60 8Z" fill="currentColor" />
      <path d="M60 39 L77 73 C81 81 87 86 96 86 H112 L91 94 H80 C73 94 68 90 64 83 L52 61Z" fill="currentColor" />
    </svg>
  );
}