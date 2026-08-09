import MapView from "@/components/MapView";
import MarineSnow from "@/components/MarineSnow";
import Watermark from "@/components/Watermark";
import { getSiteAggs, getStats } from "@/lib/content";

export default function Home() {
  const sites = getSiteAggs();
  const stats = getStats();

  return (
    <main>
      <MapView sites={sites} stats={stats} />
      <MarineSnow />
      <Watermark />
    </main>
  );
}
