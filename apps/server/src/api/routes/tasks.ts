import type { FastifyInstance } from "fastify";
import type { Task, TaskStatus } from "@otto/shared";
import { getTask, listSteps, listTasks, listApprovals, listConnectionRequests } from "../../store";
import { answerQuestion } from "../../agent";

export function taskRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { limit?: string; before?: string; status?: TaskStatus } }>(
    "/api/tasks",
    async (req): Promise<Task[]> =>
      listTasks({
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        before: req.query.before,
        status: req.query.status,
      }),
  );

  // APP-2: task detail is one call - the task, every step, and whatever it is
  // waiting on.
  app.get<{ Params: { id: string } }>("/api/tasks/:id", async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.code(404).send({ error: "task not found" });

    const approval = listApprovals().find((a) => a.task_id === task.id);
    const connection_request = listConnectionRequests().find((c) => c.task_id === task.id);

    return { ...task, steps: listSteps(task.id), approval, connection_request };
  });

  // AG-6 from the app, so a question can be answered by typing as well as by voice.
  app.post<{ Params: { id: string }; Body: { answer?: string } }>(
    "/api/tasks/:id/answer",
    async (req, reply) => {
      const answer = req.body?.answer?.trim();
      if (!answer) return reply.code(400).send({ error: "answer is required" });
      if (!getTask(req.params.id)) return reply.code(404).send({ error: "task not found" });

      const { ok } = answerQuestion(req.params.id, answer);
      if (!ok) {
        return reply.code(409).send({ error: "that task is not waiting on an answer" });
      }
      return { ok };
    },
  );
}
