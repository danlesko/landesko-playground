import Image from "next/image";
import PageHeading from "@/components/ui/PageHeading";

export default async function Home() {
  return (
    <>
      <PageHeading>Welcome to Landesko's Playground</PageHeading>
      <div>
        <p className="text-lg mt-2 lg:w-1/2">
          This is a playground for my portfolio and blog. It's a place for me to
          experiment with new technologies and share my thoughts with the world.
        </p>
      </div>
      <div className="lg:w-1/2">
        <Image
          src="/danPool.jpeg"
          alt="Lan Playing Pool"
          width="1286"
          height="1714"
          // The sidebar is a constant 250px from `lg` up and <main> adds 16px of
          // padding either side, so this column is never the 100vw that the
          // removed `layout="responsive"` prop was declaring on its behalf.
          sizes="(min-width: 1024px) calc((100vw - 282px) / 2), calc(100vw - 32px)"
          className="h-auto w-full"
          priority
        />
      </div>
    </>
  );
}
