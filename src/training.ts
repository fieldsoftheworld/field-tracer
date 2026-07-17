const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export type TrainingExample = {
  title: string;
  slide: number;
  image: string;
  takeaway: string;
  category: "boundary" | "imagery" | "not-field" | "split";
};

export type TrainingVideo = {
  title: string;
  description: string;
  source: string;
  youtube: string;
};

export const trainingVideos: TrainingVideo[] = [
  {
    title: "Many vertices",
    description: "A field-boundary tracing walkthrough.",
    source: asset("training/videos/q18KiMuT0F8.webm"),
    youtube: "https://www.youtube.com/watch?v=q18KiMuT0F8",
  },
  {
    title: "Field boundary annotation in Paraguay",
    description: "A complete annotation example in a real labeling context.",
    source: asset("training/videos/-M6i_5RdpWs.webm"),
    youtube: "https://www.youtube.com/watch?v=-M6i_5RdpWs",
  },
  {
    title: "Field splitting",
    description: "How to split contiguous or blobby agricultural areas when the imagery supports it.",
    source: asset("training/videos/73SiwV5uEGY.webm"),
    youtube: "https://www.youtube.com/watch?v=73SiwV5uEGY",
  },
];

export const trainingExamples: TrainingExample[] = [
  {
    title: "A difficult boundary",
    slide: 43,
    image: asset("training/slide-43.png"),
    takeaway:
      "Use the clearest evidence across the chip and basemap, and mark the field for review when the divide is not defensible.",
    category: "boundary",
  },
  {
    title: "Natural vegetation is not a field",
    slide: 45,
    image: asset("training/slide-45.png"),
    takeaway: "Do not label areas overtaken by native vegetation or returning to secondary forest.",
    category: "not-field",
  },
  {
    title: "Use NIR for subtle edges",
    slide: 34,
    image: asset("training/slide-34.png"),
    takeaway: "Flip to an infrared view when field interiors and boundaries are hard to separate in true color.",
    category: "imagery",
  },
  {
    title: "Roads can be real boundaries",
    slide: 36,
    image: asset("training/slide-36.png"),
    takeaway:
      "Leave a gap when a road or other background feature clearly separates fields; otherwise let neighboring fields touch.",
    category: "boundary",
  },
  {
    title: "Fire or managed clearing?",
    slide: 49,
    image: asset("training/slide-49.png"),
    takeaway: "Use time series, texture, spread, and surrounding context. Flag uncertainty instead of guessing.",
    category: "not-field",
  },
  {
    title: "Mining is not agriculture",
    slide: 55,
    image: asset("training/slide-55.png"),
    takeaway:
      "A regular dirt clearing can resemble a pre-planting field. Check for change over time and infrastructure before labeling.",
    category: "not-field",
  },
  {
    title: "Mosaics versus basemaps",
    slide: 59,
    image: asset("training/slide-59.png"),
    takeaway: "Use the Sentinel-2 windows to decide how many fields exist; use basemaps to clean up the boundary.",
    category: "imagery",
  },
  {
    title: "Plantation or annual crop?",
    slide: 77,
    image: asset("training/slide-77.png"),
    takeaway:
      "Young tree plantations can look like fields. Look for rows and persistent management signals across time windows.",
    category: "not-field",
  },
  {
    title: "Split only at a clear divide",
    slide: 93,
    image: asset("training/slide-93.png"),
    takeaway:
      "Keep one field when boundary and interior pixels are highly intermixed. Split when there is a sharp divide and pure interior on both sides.",
    category: "split",
  },
  {
    title: "Shifting cultivation can still be agriculture",
    slide: 98,
    image: asset("training/slide-98.png"),
    takeaway:
      "A field can be temporarily forest-like. Distinguish managed rotation from unmanaged regrowth using multiple windows and context.",
    category: "not-field",
  },
  {
    title: "Secondary forest versus agriculture",
    slide: 100,
    image: asset("training/slide-100.png"),
    takeaway: "When native vegetation has significantly overtaken the patch, leave it unmapped.",
    category: "not-field",
  },
  {
    title: "Splitting pasture",
    slide: 82,
    image: asset("training/slide-82.png"),
    takeaway: "Use visible roads, cleared strips, or other background features to divide large contiguous areas.",
    category: "split",
  },
];

export const trainingCategories = [
  ["all", "All examples"],
  ["boundary", "Boundaries"],
  ["imagery", "Imagery"],
  ["not-field", "Do not label"],
  ["split", "When to split"],
] as const;
