/**
 * Detect assistant replies that only announce work instead of delivering it.
 * Used to auto-continue one more ACP turn so evaluations don't stop mid-plan.
 */
export function looksLikeIncompletePlan(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // Substantial answers are complete enough
  if (t.length > 500) return false;
  // Multiple paragraphs with structure → likely done
  if ((t.match(/\n/g) || []).length >= 4 && t.length > 220) return false;

  const planOnly =
    /შემდეგ|გადავხედავ|ვიწყებ|მოვამზადებ|შემოწმებას ვიწყებ|მოკლე შეფასებას მოგცემ|I'll (check|look|review|start|examine)|let me (check|look|review)|I will (check|look|review)|starting (to |the )?|then (I |I'll |we )/i.test(
      t,
    );

  // Short + plan language → incomplete
  if (planOnly && t.length < 350) return true;

  // Ends with ellipsis / colon as if more is coming
  if (/[…:]\s*$/.test(t) && t.length < 280) return true;

  return false;
}

export const CONTINUE_PROMPT =
  "გააგრძელე და დაასრულე. უკვე ნანახი ფაილების/ინსტრუმენტების საფუძველზე მიაწოდე სრული პასუხი ან შეფასება — ნუ იტყვი მხოლოდ რომ გადახედავ; დაწერე კონკრეტული დასკვნები, რისკები და რეკომენდაციები.";
