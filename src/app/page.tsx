import Image from "next/image";

export default async function Home() {
  return (
    <>
      <h2 className="text-4xl font-bold">Welcome to Landesko's Playground</h2>
      <div>
        <p className="text-lg mt-2 lg:w-1/2">
          This is a playground for my portfolio and blog. It's a place for me to
          experiment with new technologies and share my thoughts with the world.
        </p>
      </div>
      <div className="lg:w-1/2">
        <Image
          src="/danPool.png"
          alt="Lan Playing Pool"
          width="802"
          height="1020"
          layout="responsive"
        />
      </div>
    </>
  );
}
