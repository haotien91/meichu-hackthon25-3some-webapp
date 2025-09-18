// app/yoga_5min/lessons.ts
export const lessons = [
    { slug: "lesson-1",  title: "Lesson 1",  videoId: "3Cw_npFF54U" },
    // { slug: "lesson-2",  title: "Lesson 2",  videoId: "XXXXXXXXXXX" },
    // { slug: "lesson-3",  title: "Lesson 3",  videoId: "YYYYYYYYYYY" },
  // ...一直到 day-10
] as const;

export const findBySlug = (slug: string) =>
    lessons.find(l => l.slug === slug);
