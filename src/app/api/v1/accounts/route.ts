import { aiListAccounts } from "@/lib/ai";
import { api } from "@/lib/api";

export const GET = api((uid) => aiListAccounts(uid));
