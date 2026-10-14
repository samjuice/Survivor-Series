import { Link } from "react-router-dom";
export default function NotFound() {
  return <main className="min-h-screen grid place-items-center text-center"><div><h1 className="text-4xl text-parchment">Lost in the jungle</h1><Link to="/" className="mt-4 inline-block text-gold underline">Back to camp</Link></div></main>;
}
