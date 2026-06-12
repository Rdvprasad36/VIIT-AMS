import fs from "fs";
import { forceSyncAllToFirestore } from "./server/database.js";

async function push() {
  try {
    const res = await forceSyncAllToFirestore();
    console.log("Pushed successfully:", res);
  } catch (e) {
    console.error("Error:", e);
  }
}
push();
