import { redirect } from "next/navigation";

export default function Home() {
  // Instantly push traffic from the root directly to the dashboard
  redirect("/dashboard");
}