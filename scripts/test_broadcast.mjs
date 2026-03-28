import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  const channel = supabase.channel("room:random-test");
  channel.subscribe((status) => {
    console.log("Status:", status);
    if (status === "SUBSCRIBED") {
      channel.send({ type: "broadcast", event: "TEST", payload: {} }).then((res) => {
        console.log("Broadcast result:", res);
        process.exit(0);
      });
    }
  });
}
test();
