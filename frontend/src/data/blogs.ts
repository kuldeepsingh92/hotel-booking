import { getCatalog } from "../lib/catalog";

/**
 * Blog article types and accessors backed exclusively by Redis via Spring Boot 4.1.2 API.
 * Zero static blog articles live in the frontend.
 */

export interface BlogArticle {
  slug: string;
  title: string;
  subtitle: string;
  category: "Heritage & Culture" | "Beach & Villas" | "Hill Stations" | "Travel Advice & GST" | "Itineraries";
  cityId?: string;
  readTime: string;
  publishedAt: string;
  updatedAt: string;
  author: {
    name: string;
    role: string;
    avatar: number;
    bio: string;
  };
  heroImage: number;
  heroAlt: string;
  seoDescription: string;
  keywords: string[];
  keyTakeaways: string[];
  sections: {
    id: string;
    heading: string;
    body: string[];
    callout?: {
      title: string;
      text: string;
    };
  }[];
  hotelIds: string[];
  faqs: {
    question: string;
    answer: string;
  }[];
}

export const getBlogs = () => getCatalog().blogs;
export const getBlog = (slug: string) => getCatalog().blogs.find((b) => b.slug === slug) ?? null;
