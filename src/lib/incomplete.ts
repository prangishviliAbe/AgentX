/**
 * Detect assistant replies that only announce work instead of delivering it.
 * Used to auto-continue ACP turns so the user is not stuck pressing Continue.
 */

export function looksLikeIncompletePlan(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // Substantial structured answers are complete enough
  if (t.length > 600) return false;
  if ((t.match(/\n/g) || []).length >= 5 && t.length > 280) return false;
  if (/```/.test(t) && t.length > 200) return false;

  const planOnly =
    /შემდეგ|გადავხედავ|გავიგო|ვიწყებ|მოვამზადებ|შემოწმებას|შეფასებას მოგცემ|განვიხილავ|დავათვალიერებ|I'll (check|look|review|start|examine|inspect)|let me (check|look|review|see)|I will (check|look|review)|I('ll| will) (take a look|explore)|starting (to |the )?|then (I |I'll |we )|to understand what/i.test(
      t,
    );

  if (planOnly && t.length < 450) return true;
  if (/[…:]\s*$/.test(t) && t.length < 320) return true;
  // Very short answer after tools usually means the model bailed early
  if (t.length < 120) return true;

  return false;
}

/** When tools already ran, a thin answer should still auto-continue. */
export function shouldAutoContinue(
  text: string,
  opts?: { toolsRan?: boolean },
): boolean {
  if (looksLikeIncompletePlan(text)) return true;
  if (opts?.toolsRan && text.trim().length < 400 && !/```/.test(text)) {
    return true;
  }
  return false;
}

export const CONTINUE_PROMPT =
  "გააგრძელე ახლა და დაასრულე კონკრეტული პასუხით. " +
  "უკვე გაშვებული tool-ების შედეგებზე დაყრდნობით: ჩამოწერე რა არის საქაღალდეში/პროექტში, " +
  "მოკლე შეფასება ან პასუხი. " +
  "ნუ იტყვი მხოლოდ რომ გადახედავ ან რომ გაიგებ — დაწერე ფაქტები ახლავე. " +
  "ახალი tool მხოლოდ თუ აუცილებელია; უპირატესობა მიეცი პირდაპირ პასუხს.";

export const CONTINUE_PROMPT_NO_TOOLS =
  "Do not run more exploration tools. Answer now in clear bullets based on context you already have. " +
  "If you lack info, say exactly what is missing in one short list.";
