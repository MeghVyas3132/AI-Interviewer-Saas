import Link from 'next/link';

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2">
      <div className="p-2 bg-primary text-primary-foreground rounded-lg group-hover:bg-primary/90 transition-colors">
        <img src="/logo.png" alt="Aigenthix AI Powered Coach Logo" className="h-5 w-5" />
      </div>
      <h1 className="font-headline text-xl font-bold tracking-tighter text-primary group-hover:text-primary/90 transition-colors group-data-[state=collapsed]:hidden">
        Aigenthix AI Powered Coach
      </h1>
    </Link>
  );
}
