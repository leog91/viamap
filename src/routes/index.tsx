import { createFileRoute } from "@tanstack/react-router";
import { Explorer } from "../features/explorer/explorer";

export const Route = createFileRoute("/")({ component: Explorer });
