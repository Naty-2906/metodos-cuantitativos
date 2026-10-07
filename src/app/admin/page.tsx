import { authorized } from "@/lib/auth";
import Admin from "@/components/admin";
export default async function Page() {
  return <Admin authenticated={await authorized()} />;
}
