import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export default async function TodosPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: todos } = await supabase.from("todos").select();

  return (
    <main className="shell" style={{ padding: "2rem" }}>
      <h1>Todos</h1>
      <ul>
        {todos?.map((todo: { id: string; name: string }) => (
          <li key={todo.id}>{todo.name}</li>
        ))}
      </ul>
    </main>
  );
}
