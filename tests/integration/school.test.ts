import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Class teacher, coordinator and setup screens against the dev database: two throwaway schools,
// cleaned up afterwards. Route handlers are called directly with genuinely signed initData.

const { prisma } = await import("@/lib/db");
const { getEnv } = await import("@/lib/env");
const { signInitData } = await import("@/lib/auth/init-data");
const { loadAppUserById } = await import("@/lib/auth/user");
const { addStudents, createClass, createInvite, removeMembership, setClassTeacher } = await import("@/lib/domain/school-setup");
const studentsRoute = await import("@/app/api/app/classes/[classId]/students/route");
const schoolRoute = await import("@/app/api/app/school/route");
const classHealthRoute = await import("@/app/api/app/school/classes/[classId]/route");
const subjectRoute = await import("@/app/api/app/school/classes/[classId]/subjects/[subject]/route");
const studentRoute = await import("@/app/api/app/students/[studentId]/route");
const loadRoute = await import("@/app/api/app/classes/[classId]/load/route");
const strugglingRoute = await import("@/app/api/app/classes/[classId]/struggling/route");
const setupRoute = await import("@/app/api/app/school/setup/route");

const run = Date.now();
const base = 7_000_000_000n + BigInt(run % 1_000_000_000);
const TG = { coord: base, ct: base + 1n, maths: base + 2n, english: base + 3n, ravi: base + 4n, anu: base + 5n, otherCoord: base + 6n };
const SECRETS = ["SECRET-SUBMISSION-TEXT", "SECRET-DOUBT-TEXT", "SECRET-FEEDBACK-COMMENT"];

type Ids = { school: string; other: string; klass: string; ravi: string; anu: string; users: Record<keyof typeof TG, string> };
let ids: Ids;

const auth = (tg: bigint) => ({ Authorization: `tma ${signInitData({ id: Number(tg), first_name: "T" }, getEnv().TELEGRAM_BOT_TOKEN)}` });
const ctx = <T extends object>(params: T) => ({ params: Promise.resolve(params) });
const get = (path: string, tg: bigint) => new Request(`http://test${path}`, { headers: auth(tg) });
const user = async (key: keyof typeof TG) => (await loadAppUserById(ids.users[key]))!;

describe.skipIf(!process.env.DATABASE_URL)("class teacher + coordinator (integration)", () => {
  beforeAll(async () => {
    const school = await prisma.school.create({ data: { name: `ZZ Test S ${run}` } });
    const other = await prisma.school.create({ data: { name: `ZZ Test S2 ${run}` } });
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "9S", grade: 9 } });
    const users = {} as Ids["users"];
    for (const [key, tg] of Object.entries(TG) as [keyof typeof TG, bigint][]) {
      users[key] = (await prisma.user.create({ data: { telegramId: tg, chatId: tg, displayName: key } })).id;
    }
    const m = (userId: string, role: "COORDINATOR" | "CLASS_TEACHER" | "SUBJECT_TEACHER", extra: { classId?: string; subject?: string; schoolId?: string } = {}) =>
      prisma.membership.create({ data: { userId, schoolId: extra.schoolId ?? school.id, classId: extra.classId ?? null, role, subject: extra.subject ?? null } });
    await m(users.coord, "COORDINATOR");
    await m(users.otherCoord, "COORDINATOR", { schoolId: other.id });
    await m(users.ct, "CLASS_TEACHER", { classId: klass.id });
    await m(users.maths, "SUBJECT_TEACHER", { classId: klass.id, subject: "Maths" });
    await m(users.english, "SUBJECT_TEACHER", { classId: klass.id, subject: "English" });
    const ravi = await prisma.student.create({ data: { schoolId: school.id, classId: klass.id, name: "Ravi", rollNo: "1", userId: users.ravi } });
    const anu = await prisma.student.create({ data: { schoolId: school.id, classId: klass.id, name: "Anu", rollNo: "2", userId: users.anu } });

    const mk = (subject: string, title: string, dueInDays: number, by: string) =>
      prisma.assignment.create({
        data: {
          schoolId: school.id, classId: klass.id, subject, title, instructions: "SECRET-INSTRUCTIONS-ARE-FINE-TO-HIDE",
          dueAt: new Date(Date.now() + dueInDays * 86_400_000), status: "PUBLISHED", publishedAt: new Date(), createdByUserId: by,
        },
      });
    const maths = await mk("Maths", "Exercise 4.2", -1, users.maths); // overdue
    const english = await mk("English", "Essay", 2, users.english);
    const delivered = new Date(Date.now() - 3 * 86_400_000);
    // Ravi: overdue in Maths (submitted + feedback on an earlier try... still open), stuck in English with a doubt.
    const raviMaths = await prisma.studentAssignment.create({ data: { assignmentId: maths.id, studentId: ravi.id, status: "NEEDS_REVISION", deliveredAt: delivered, ackedVersion: 1 } });
    const sub = await prisma.submission.create({ data: { studentAssignmentId: raviMaths.id, kind: "TEXT", text: SECRETS[0] } });
    await prisma.feedback.create({ data: { studentAssignmentId: raviMaths.id, submissionId: sub.id, teacherUserId: users.maths, comment: SECRETS[2], result: "NEEDS_REVISION" } });
    const raviEnglish = await prisma.studentAssignment.create({
      data: { assignmentId: english.id, studentId: ravi.id, status: "BLOCKED", blockedAt: new Date(), deliveredAt: delivered, ackedVersion: 1 },
    });
    await prisma.doubtMessage.create({ data: { studentAssignmentId: raviEnglish.id, authorUserId: users.ravi, authorRole: "STUDENT", text: SECRETS[1] } });
    await prisma.studentAssignment.create({ data: { assignmentId: maths.id, studentId: anu.id, status: "COMPLETED", deliveredAt: delivered, ackedVersion: 1 } });
    await prisma.studentAssignment.create({ data: { assignmentId: english.id, studentId: anu.id, status: "ACKNOWLEDGED", deliveredAt: delivered, ackedVersion: 1 } });

    ids = { school: school.id, other: other.id, klass: klass.id, ravi: ravi.id, anu: anu.id, users };
  });

  afterAll(async () => {
    if (!ids) return;
    const schools = [ids.school, ids.other];
    const sas = await prisma.studentAssignment.findMany({ where: { assignment: { schoolId: { in: schools } } }, select: { id: true } });
    const saIds = sas.map((s) => s.id);
    await prisma.activityEvent.deleteMany({ where: { schoolId: { in: schools } } });
    await prisma.feedback.deleteMany({ where: { studentAssignmentId: { in: saIds } } });
    await prisma.submission.deleteMany({ where: { studentAssignmentId: { in: saIds } } });
    await prisma.doubtMessage.deleteMany({ where: { studentAssignmentId: { in: saIds } } });
    await prisma.studentAssignment.deleteMany({ where: { id: { in: saIds } } });
    await prisma.assignment.deleteMany({ where: { schoolId: { in: schools } } });
    await prisma.teacherInvite.deleteMany({ where: { schoolId: { in: schools } } });
    await prisma.joinCode.deleteMany({ where: { class: { schoolId: { in: schools } } } });
    await prisma.student.deleteMany({ where: { schoolId: { in: schools } } });
    await prisma.membership.deleteMany({ where: { schoolId: { in: schools } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids.users) } } });
    await prisma.class.deleteMany({ where: { schoolId: { in: schools } } });
    await prisma.school.deleteMany({ where: { id: { in: schools } } });
  });

  it("school health never returns submission content, doubt text or feedback (every drill level)", async () => {
    const responses = [
      await schoolRoute.GET(get(`/api/app/school?schoolId=${ids.school}`, TG.coord), ctx({})),
      await classHealthRoute.GET(get(`/api/app/school/classes/${ids.klass}`, TG.coord), ctx({ classId: ids.klass })),
      await subjectRoute.GET(get(`/api/app/school/classes/${ids.klass}/subjects/Maths`, TG.coord), ctx({ classId: ids.klass, subject: "Maths" })),
      await subjectRoute.GET(get(`/api/app/school/classes/${ids.klass}/subjects/English`, TG.coord), ctx({ classId: ids.klass, subject: "English" })),
    ];
    for (const res of responses) {
      expect(res.status).toBe(200);
      const text = await res.text();
      for (const secret of [...SECRETS, "SECRET-INSTRUCTIONS"]) expect(text).not.toContain(secret);
    }
  });

  it("school health numbers: per class, then per subject, then names + statuses", async () => {
    const school = await (await schoolRoute.GET(get(`/api/app/school?schoolId=${ids.school}`, TG.coord), ctx({}))).json();
    expect(school.classes[0]).toMatchObject({ name: "9S", linked: 2, total: 2, stats: { openAssignments: 2, stuck: 1, overduePct: 25, seenPct: 100 } });
    expect(school.worstClassId).toBe(ids.klass);
    const detail = await (await subjectRoute.GET(get("/x", TG.coord), ctx({ classId: ids.klass, subject: "Maths" }))).json();
    expect(detail.assignments[0].students).toEqual([
      { name: "Anu", status: "COMPLETED", overdue: false, stuck: false },
      { name: "Ravi", status: "NEEDS_REVISION", overdue: true, stuck: false },
    ]);
  });

  it("another school's coordinator gets 403 on every school screen (and it's logged)", async () => {
    expect((await schoolRoute.GET(get(`/api/app/school?schoolId=${ids.school}`, TG.otherCoord), ctx({}))).status).toBe(403);
    expect((await classHealthRoute.GET(get("/x", TG.otherCoord), ctx({ classId: ids.klass }))).status).toBe(403);
    expect((await subjectRoute.GET(get("/x", TG.otherCoord), ctx({ classId: ids.klass, subject: "Maths" }))).status).toBe(403);
    expect((await setupRoute.GET(get(`/api/app/school/setup?schoolId=${ids.school}`, TG.otherCoord), ctx({}))).status).toBe(403);
    expect((await schoolRoute.GET(get(`/api/app/school?schoolId=${ids.school}`, TG.ct), ctx({}))).status).toBe(403); // a teacher isn't a coordinator
    const denied = await prisma.activityEvent.count({ where: { type: "access.denied", schoolId: ids.school } });
    expect(denied).toBeGreaterThanOrEqual(4);
  });

  it("class teacher: Load and Struggling; a subject teacher gets 403", async () => {
    const load = await (await loadRoute.GET(get("/x", TG.ct), ctx({ classId: ids.klass }))).json();
    expect(load.days.flatMap((d: { items: { subject: string }[] }) => d.items.map((i) => i.subject))).toEqual(["English"]); // Maths is past due
    const struggling = await (await strugglingRoute.GET(get("/x", TG.ct), ctx({ classId: ids.klass }))).json();
    expect(struggling.students).toEqual([
      expect.objectContaining({ name: "Ravi", summary: "stuck in English, overdue in Maths" }),
    ]);
    expect((await loadRoute.GET(get("/x", TG.maths), ctx({ classId: ids.klass }))).status).toBe(403);
    expect((await strugglingRoute.GET(get("/x", TG.maths), ctx({ classId: ids.klass }))).status).toBe(403);
  });

  it("student page: class teacher all subjects, subject teacher own subject, student self; others 403", async () => {
    const subjects = async (tg: bigint) => {
      const res = await studentRoute.GET(get("/x", tg), ctx({ studentId: ids.ravi }));
      return res.status === 200 ? (await res.json()).items.map((i: { subject: string }) => i.subject).sort() : res.status;
    };
    expect(await subjects(TG.ct)).toEqual(["English", "Maths"]);
    expect(await subjects(TG.ravi)).toEqual(["English", "Maths"]);
    expect(await subjects(TG.maths)).toEqual(["Maths"]);
    expect(await subjects(TG.english)).toEqual(["English"]);
    expect(await subjects(TG.anu)).toBe(403); // another student
    expect(await subjects(TG.coord)).toBe(403); // coordinator uses the status-only school view
    expect(await subjects(TG.otherCoord)).toBe(403);
  });

  it("setup: create a class from a pasted roster (roll numbers in order + class code)", async () => {
    const r = await createClass(await user("coord"), { schoolId: ids.school, name: "9T", grade: 9, roster: "Meena\n\nArjun K\nZoya\n" });
    const students = await prisma.student.findMany({ where: { classId: r.classId }, orderBy: { rollNo: "asc" } });
    expect(students.map((s) => [s.rollNo, s.name])).toEqual([["1", "Meena"], ["2", "Arjun K"], ["3", "Zoya"]]);
    expect(r.link.url).toMatch(/\?start=c_[A-Z0-9]{6}$/);
    await expect(createClass(await user("coord"), { schoolId: ids.school, name: "9T", grade: 9, roster: "" })).rejects.toMatchObject({ status: 409 });
    await expect(createClass(await user("otherCoord"), { schoolId: ids.school, name: "9Z", grade: 9, roster: "" })).rejects.toThrow(/coordinator/);
  });

  it("add students to an existing class: roll numbers continue, duplicates and existing names skipped, logged", async () => {
    const coord = await user("coord");
    const c = await createClass(coord, { schoolId: ids.school, name: "9R", grade: 9, roster: "Test One, Test Two" });
    const r = await addStudents(coord, c.classId, "Test Three\ntest one, Test Four, Test Four\n\n");
    expect(r).toMatchObject({ added: 2, skipped: ["test one"], firstRollNo: 3 });
    const students = await prisma.student.findMany({ where: { classId: c.classId } });
    expect(students.map((s) => [s.rollNo, s.name]).sort((a, b) => Number(a[0]) - Number(b[0]))).toEqual([
      ["1", "Test One"], ["2", "Test Two"], ["3", "Test Three"], ["4", "Test Four"],
    ]);
    expect(await prisma.activityEvent.count({ where: { type: "roster.updated", classId: c.classId } })).toBe(1);
    await expect(addStudents(coord, c.classId, " , \n")).rejects.toMatchObject({ status: 400 });
  });

  it("add students: a teacher of the class may; another school's coordinator and a student get 403", async () => {
    const post = (tg: bigint, roster: string) =>
      studentsRoute.POST(
        new Request(`http://test/api/app/classes/${ids.klass}/students`, {
          method: "POST",
          headers: { ...auth(tg), "Content-Type": "application/json" },
          body: JSON.stringify({ roster }),
        }),
        ctx({ classId: ids.klass }),
      );
    const ok = await post(TG.maths, "Zoya Khan");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ added: 1, firstRollNo: 3 }); // 9S had Ravi (1) and Anu (2)
    expect((await post(TG.otherCoord, "Intruder")).status).toBe(403);
    expect((await post(TG.ravi, "Intruder")).status).toBe(403);
    expect(await prisma.student.count({ where: { classId: ids.klass, name: "Intruder" } })).toBe(0);
  });

  it("setup: one-use invite valid 7 days with the chosen grants; classes from another school refused", async () => {
    const coord = await user("coord");
    const inv = await createInvite(coord, {
      schoolId: ids.school,
      grants: [
        { classId: ids.klass, role: "SUBJECT_TEACHER", subject: "Science" },
        { classId: ids.klass, role: "CLASS_TEACHER", subject: "ignored" },
      ],
    });
    expect(inv.url).toMatch(new RegExp(`\\?start=t_${inv.code}$`));
    expect(inv.grants).toEqual(["Science teacher · 9S", "Class teacher · 9S"]);
    const row = await prisma.teacherInvite.findUniqueOrThrow({ where: { code: inv.code } });
    expect(row.grants).toEqual([
      { classId: ids.klass, role: "SUBJECT_TEACHER", subject: "Science" },
      { classId: ids.klass, role: "CLASS_TEACHER", subject: null },
    ]);
    const days = (row.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    const otherClass = await prisma.class.create({ data: { schoolId: ids.other, name: "X1", grade: 9 } });
    await expect(createInvite(coord, { schoolId: ids.school, grants: [{ classId: otherClass.id, role: "CLASS_TEACHER" }] })).rejects.toThrow(/isn't in your school/);
    await expect(createInvite(coord, { schoolId: ids.school, grants: [{ classId: ids.klass, role: "SUBJECT_TEACHER", subject: " " }] })).rejects.toMatchObject({ status: 400 });
  });

  it("setup: set the class teacher (replaces the previous one); remove a membership; can't remove own coordinator role", async () => {
    const coord = await user("coord");
    await setClassTeacher(coord, ids.klass, ids.users.maths);
    const cts = await prisma.membership.findMany({ where: { classId: ids.klass, role: "CLASS_TEACHER" } });
    expect(cts.map((m) => m.userId)).toEqual([ids.users.maths]);
    await expect(setClassTeacher(coord, ids.klass, ids.users.ravi)).rejects.toMatchObject({ status: 400 }); // not a teacher here
    await expect(setClassTeacher(await user("otherCoord"), ids.klass, ids.users.ct)).rejects.toThrow(/coordinator/);

    const english = await prisma.membership.findFirstOrThrow({ where: { userId: ids.users.english, role: "SUBJECT_TEACHER" } });
    await removeMembership(coord, english.id);
    expect(await prisma.membership.count({ where: { id: english.id } })).toBe(0);
    const own = await prisma.membership.findFirstOrThrow({ where: { userId: ids.users.coord, role: "COORDINATOR" } });
    await expect(removeMembership(coord, own.id)).rejects.toMatchObject({ status: 400 });
  });
});
