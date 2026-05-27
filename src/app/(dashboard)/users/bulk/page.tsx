import { redirect } from "next/navigation";

/** /users/bulk → 기본 Edit 모드로 보냄 */
export default function BulkIndexPage(): never {
  redirect("/users/bulk/edit");
}
