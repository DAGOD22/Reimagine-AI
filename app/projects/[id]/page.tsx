import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { serializeProject } from "@/lib/server/projects";
import { ApiError } from "@/lib/server/errors";
import { Workspace } from "@/components/workspace/workspace";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user) return { title: "Project" };
  try { return { title: serializeProject((await params).id, user.id).name }; }
  catch { return { title: "Project" }; }
}

export default async function ProjectPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=/projects/${(await params).id}`);
  try {
    const project = serializeProject((await params).id, user.id);
    return <Workspace initialProject={project} user={user} />;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}
