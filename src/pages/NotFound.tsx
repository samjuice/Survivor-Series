import { Link } from "react-router-dom";
export default function NotFound() {
  return <main className="grid min-h-[60dvh] place-items-center text-center"><div><h1 className="text-4xl font-black">Lost in the jungle</h1><p className="mt-2 text-sand/80">That page doesn't exist.</p><Link to="/" className="mt-4 inline-block min-h-11 py-2 underline">Back to camp</Link></div></main>;
}
