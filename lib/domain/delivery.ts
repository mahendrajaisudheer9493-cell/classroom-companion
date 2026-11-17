/**
 * Delivers already-published assignments to a student who just linked (respecting quiet hours).
 * Stub: Task 3 implements it with the OutboundMessage queue.
 */
export async function deliverPendingAssignments(studentId: string): Promise<{ queued: number }> {
  void studentId;
  return { queued: 0 };
}
