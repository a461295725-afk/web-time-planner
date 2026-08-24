import ProjectDetailWorkspace from "@/components/project-detail-workspace";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectDetailWorkspace projectId={id} />;
}
