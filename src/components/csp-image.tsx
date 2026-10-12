type CspImageProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  loading?: "eager" | "lazy";
  decoding?: "async" | "sync" | "auto";
  fetchPriority?: "high" | "low" | "auto";
  className?: string;
};

/** Controlled Sharp-derived local media and trusted static SVGs; layout belongs to external CSS. */
export function CspImage({ src, alt, width, height, loading = "lazy", decoding = "async", fetchPriority, className }: CspImageProps) {
  // Next/Image adds an inline color style. These assets are already derived by Sharp or trusted SVGs.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={width} height={height} loading={loading} decoding={decoding} fetchPriority={fetchPriority} className={className} />;
}
