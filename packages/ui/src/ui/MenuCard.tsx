type MenuCardProps = {
  name: string;
  price: string;
  imageSrc?: string;
  imageAlt?: string;
};

export function MenuCard({ name, price, imageSrc, imageAlt = "" }: MenuCardProps) {
  return (
    <div className="w-[220px] rounded-lg bg-surface p-md shadow-1">
      <div className="relative mb-sm h-[110px] overflow-hidden rounded-md bg-gradient-to-br from-primary to-surface-ocean">
        {imageSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={imageAlt}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <p className="font-medium text-on-surface">{name}</p>
      <p className="text-sm font-semibold text-primary">{price}</p>
    </div>
  );
}
