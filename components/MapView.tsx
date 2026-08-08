"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import type { SiteAgg, Stats } from "@/lib/content";
import StatsPanel from "./StatsPanel";

// Dark, low-noise vector basemap — no key, no billing (spec §1).
const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
const TEAL = "#5fd0c4";

type Active = { site: SiteAgg; pinned: boolean };

export default function MapView({
  sites,
  stats,
}: {
  sites: SiteAgg[];
  stats: Stats;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const router = useRouter();

  // The one card shown at a time; pinned survives mouseout, hover does not.
  const [active, setActive] = useState<Active | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const activeRef = useRef<Active | null>(null);
  activeRef.current = active;

  useEffect(() => {
    const plotted = sites.filter((s) => s.lat != null && s.lng != null);
    if (!containerRef.current || !plotted.length) return;

    let map: MLMap;
    let disposed = false;
    let breatheRAF = 0;
    let hoveredId: number | null = null;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (disposed || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        style: BASEMAP_STYLE,
        attributionControl: false,
        // rough center; fitBounds on load frames both regions properly
        center: [108, 12],
        zoom: 3.2,
        dragRotate: false,
        pitchWithRotate: false,
      });
      mapRef.current = map;
      if (new URLSearchParams(window.location.search).has("debug")) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__map = map;
      }

      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        "bottom-right"
      );
      map.addControl(
        new maplibregl.NavigationControl({
          showCompass: false,
          showZoom: true,
        }),
        "top-left"
      );

      const byId = new Map(plotted.map((s) => [s.id, s]));

      const repos = () => {
        const a = activeRef.current;
        if (!a || !map) return;
        const p = map.project([a.site.lng!, a.site.lat!]);
        setPos({ x: p.x, y: p.y });
      };

      const onLoad = () => {
        // Recolor the basemap to the abyss palette. Type-check every layer —
        // "fill-color" on a line layer (e.g. waterway) throws, and a throw here
        // would abort marker setup entirely. Guarded, so it degrades quietly.
        for (const layer of map.getStyle().layers ?? []) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const l = layer as any;
          if (layer.type === "symbol") {
            // strip the basemap's own labels — no road/POI text (§3)
            map.setLayoutProperty(layer.id, "visibility", "none");
          } else if (layer.type === "background") {
            map.setPaintProperty(layer.id, "background-color", "#05090c");
          } else if (
            layer.type === "fill" &&
            /water/i.test(`${layer.id} ${l["source-layer"] ?? ""}`)
          ) {
            map.setPaintProperty(layer.id, "fill-color", "#0a1319");
          }
        }

        // 3) clustered site source. Andaman sites sit ~1–2 km apart, so they
        //    collapse into one badge at the overview zoom and split on zoom-in.
        map.addSource("sites", {
          type: "geojson",
          promoteId: "id",
          cluster: true,
          clusterRadius: 44,
          clusterMaxZoom: 12,
          clusterProperties: { dives: ["+", ["get", "dives"]] },
          data: {
            type: "FeatureCollection",
            features: plotted.map((s) => ({
              type: "Feature",
              id: s.id,
              geometry: { type: "Point", coordinates: [s.lng!, s.lat!] },
              properties: { id: s.id, dives: s.dives },
            })),
          },
        });

        // radius scales with dive count: r = 6 + dives*2.4 (mockup)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const radius: any = ["+", 6, ["*", 2.4, ["get", "dives"]]];

        // soft halo beneath every point (clustered or not)
        map.addLayer({
          id: "sites-halo",
          type: "circle",
          source: "sites",
          paint: {
            "circle-radius": ["+", radius, 7],
            "circle-color": TEAL,
            "circle-opacity": 0.06,
          },
        });

        // clusters
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "sites",
          filter: ["has", "point_count"],
          paint: {
            "circle-radius": radius,
            "circle-color": TEAL,
            "circle-opacity": 0.18,
            "circle-stroke-color": TEAL,
            "circle-stroke-width": 1.6,
            "circle-stroke-opacity": 0.9,
          },
        });
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "sites",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["to-string", ["get", "dives"]],
            "text-font": ["Noto Sans Regular"],
            "text-size": 12,
            "text-allow-overlap": true,
          },
          paint: { "text-color": "#e7eef2" },
        });

        // individual sites — fill lifts on hover (feature-state)
        map.addLayer({
          id: "sites-unclustered",
          type: "circle",
          source: "sites",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": radius,
            "circle-color": TEAL,
            "circle-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.42,
              0.16,
            ],
            "circle-stroke-color": TEAL,
            "circle-stroke-width": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              2,
              1.4,
            ],
            "circle-stroke-opacity": 0.9,
          },
        });

        // frame both dive regions with padding (§3)
        const bounds = new maplibregl.LngLatBounds();
        for (const s of plotted) bounds.extend([s.lng!, s.lat!]);
        map.fitBounds(bounds, { padding: 90, duration: 0, maxZoom: 9 });

        // --- interactions --------------------------------------------------
        const setHover = (id: number | null) => {
          if (hoveredId === id) return;
          if (hoveredId != null)
            map.setFeatureState(
              { source: "sites", id: hoveredId },
              { hover: false }
            );
          hoveredId = id;
          if (id != null)
            map.setFeatureState({ source: "sites", id }, { hover: true });
        };

        map.on("mousemove", "sites-unclustered", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const id = f.id as number;
          setHover(id);
          map.getCanvas().style.cursor = "pointer";
          // hover never overrides a pinned card
          if (!activeRef.current?.pinned) {
            const site = byId.get(id);
            if (site) {
              setActive({ site, pinned: false });
              const p = map.project([site.lng!, site.lat!]);
              setPos({ x: p.x, y: p.y });
            }
          }
        });
        map.on("mouseleave", "sites-unclustered", () => {
          setHover(null);
          map.getCanvas().style.cursor = "";
          if (!activeRef.current?.pinned) setActive(null);
        });

        // click a site: 1 dive → straight to it; several → pin card w/ links
        map.on("click", "sites-unclustered", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const site = byId.get(f.id as number);
          if (!site) return;
          if (site.diveNumbers.length === 1) {
            router.push(`/dives/${site.diveNumbers[0]}`);
          } else {
            setActive({ site, pinned: true });
            const p = map.project([site.lng!, site.lat!]);
            setPos({ x: p.x, y: p.y });
          }
        });

        // click a cluster: zoom to expand it
        map.on("click", "clusters", async (e) => {
          const f = map.queryRenderedFeatures(e.point, {
            layers: ["clusters"],
          })[0];
          const clusterId = f?.properties?.cluster_id;
          if (clusterId == null) return;
          const src = map.getSource("sites") as GeoJSONSource;
          const zoom = await src.getClusterExpansionZoom(clusterId);
          map.easeTo({
            center: (f.geometry as GeoJSON.Point).coordinates as [number, number],
            zoom,
          });
        });
        map.on("mouseenter", "clusters", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "clusters", () => {
          map.getCanvas().style.cursor = "";
        });

        // click empty water: dismiss a pinned card
        map.on("click", (e) => {
          const hits = map.queryRenderedFeatures(e.point, {
            layers: ["sites-unclustered", "clusters"],
          });
          if (!hits.length) setActive(null);
        });

        // keep the card glued to its marker as the map moves
        map.on("move", repos);

        // 4) barely-perceptible "breathing" on the halos — Madhav FM DNA
        if (!reduceMotion) {
          let t = 0;
          const tick = () => {
            t += 0.02;
            const k = 0.06 + Math.sin(t) * 0.02;
            if (map.getLayer("sites-halo"))
              map.setPaintProperty("sites-halo", "circle-opacity", k);
            breatheRAF = requestAnimationFrame(tick);
          };
          breatheRAF = requestAnimationFrame(tick);
        }
      };
      // Never let a cosmetic hiccup blank the markers.
      map.on("load", () => {
        try {
          onLoad();
        } catch (err) {
          console.error("map setup failed:", (err as Error).message);
        }
      });
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(breatheRAF);
      if (map!) map.remove();
      mapRef.current = null;
    };
    // sites/stats are build-time constant; mount once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const card = active;

  return (
    <div className="fixed inset-0 bg-abyss">
      <div ref={containerRef} className="absolute inset-0" />

      <StatsPanel stats={stats} />

      {card && pos && (
        <div
          className={`dive-card panel ${card ? "is-visible" : ""} ${
            card.pinned ? "is-pinned" : ""
          }`}
          style={{ left: pos.x, top: pos.y }}
        >
          <div className="name">{card.site.name}</div>
          <div className="place">{card.site.place}</div>
          <div className="row">
            <div>
              <div className="n">{card.site.dives}</div>
              <div className="l">Dives here</div>
            </div>
            <div>
              <div className="n">
                {card.site.maxDepthM != null ? Math.round(card.site.maxDepthM) : "—"}
                <small>m</small>
              </div>
              <div className="l">Max depth</div>
            </div>
            <div>
              <div className="n">
                {card.site.avgDurationMin ?? "—"}
                <small>min</small>
              </div>
              <div className="l">Avg time</div>
            </div>
          </div>

          {card.pinned && card.site.diveNumbers.length > 1 && (
            <div className="dives">
              {card.site.diveNumbers.map((n) => (
                <Link key={n} href={`/dives/${n}`} className="dive-chip">
                  Dive {n}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
