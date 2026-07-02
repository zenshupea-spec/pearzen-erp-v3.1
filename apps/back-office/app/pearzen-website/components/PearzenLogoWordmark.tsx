import Image from 'next/image';

type PearzenLogoWordmarkProps = {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
};

export default function PearzenLogoWordmark({
  src,
  alt,
  className = '',
  priority = false,
}: PearzenLogoWordmarkProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={736}
      height={152}
      className={`h-auto w-auto object-contain ${className}`}
      priority={priority}
    />
  );
}
