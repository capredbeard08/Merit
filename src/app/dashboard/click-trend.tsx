"use client";

type Point = { label: string; clicks: number };

export default function ClickTrend({ points }: { points: Point[] }) {
  const width = 640;
  const height = 190;
  const left = 24;
  const right = 14;
  const top = 18;
  const bottom = 34;
  const max = Math.max(4, ...points.map((point) => point.clicks));
  const x = (index: number) => left + (points.length <= 1 ? 0 : index * (width - left - right) / (points.length - 1));
  const y = (value: number) => top + (max - value) * (height - top - bottom) / max;
  const polyline = points.map((point, index) => x(index) + "," + y(point.clicks)).join(" ");
  const area = points.length ? left + "," + (height - bottom) + " " + polyline + " " + x(points.length - 1) + "," + (height - bottom) : "";

  return (
    <div className="mt-5">
      {points.every((point) => point.clicks === 0) ? <p className="mb-3 text-sm text-[#718178]">No review-link clicks recorded in this period yet.</p> : null}
      <svg viewBox={"0 0 " + width + " " + height} role="img" aria-label={"Review-link clicks by week: " + points.map((point) => point.label + " " + point.clicks).join(", ")} className="h-auto w-full overflow-visible">
        {[0, 1, 2, 3].map((tick) => {
          const value = Math.round(max * tick / 3);
          const yy = y(value);
          return <g key={tick}><line x1={left} y1={yy} x2={width - right} y2={yy} stroke="#e7ede9" strokeWidth="1" /><text x={left - 5} y={yy + 4} textAnchor="end" fontSize="10" fill="#7b8982">{value}</text></g>;
        })}
        {points.length ? <polygon points={area} fill="#dcefe7" opacity="0.75" /> : null}
        {points.length ? <polyline points={polyline} fill="none" stroke="#075b46" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {points.map((point, index) => <g key={point.label}><circle cx={x(index)} cy={y(point.clicks)} r="4" fill="#075b46" /><text x={x(index)} y={height - 10} textAnchor="middle" fontSize="10" fill="#718178">{point.label}</text><title>{point.label}: {point.clicks} clicks</title></g>)}
      </svg>
    </div>
  );
}
