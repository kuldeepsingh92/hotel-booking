import { Link } from "../lib/router";
import { Footer, Header } from "../components/Header";
import { btnClass } from "../components/ui";

export default function NotFound({
  title = "That page has checked out",
  text = "The link may be old, or the stay may no longer be listed. Your saved stays are still in the header.",
}: { title?: string; text?: string }) {
  return (
    <>
      <Header />
      <main className="container-x py-24 text-center">
        <p className="eyebrow text-pine-600">Nothing here</p>
        <h1 className="display mx-auto mt-3 max-w-xl text-5xl leading-tight">{title}</h1>
        <p className="mx-auto mt-4 max-w-md text-ink-500">{text}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/search" className={btnClass("primary", "lg")}>
            Browse all stays
          </Link>
          <Link to="/" className={btnClass("outline", "lg")}>
            Back to home
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
