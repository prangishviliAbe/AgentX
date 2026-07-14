import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  looksLikeIncompletePlan,
  shouldAutoContinue,
} from "../src/lib/incomplete.ts";

describe("looksLikeIncompletePlan", () => {
  it("detects short Georgian plan-only reply", () => {
    assert.equal(
      looksLikeIncompletePlan(
        "პროექტს გადავხედავ სტრუქტურით, კოდით და დოკუმენტაციით, შემდეგ მოკლე შეფასებას მოგცემ.",
      ),
      true,
    );
  });

  it("detects folder glance without listing", () => {
    assert.equal(
      looksLikeIncompletePlan(
        "პროექტს გადავხედავ, რომ გავიგო რაა აქ თემაში.",
      ),
      true,
    );
    assert.equal(
      shouldAutoContinue("პროექტს გადავხედავ, რომ გავიგო რაა აქ თემაში.", {
        toolsRan: true,
      }),
      true,
    );
  });

  it("detects English plan-only reply", () => {
    assert.equal(
      looksLikeIncompletePlan(
        "I'll check the project structure and then give you a short evaluation.",
      ),
      true,
    );
  });

  it("does not flag a long concrete evaluation", () => {
    const long = Array.from({ length: 20 }, (_, i) =>
      `Finding ${i + 1}: the module has a clear risk around auth and should use rate limits.\n`,
    ).join("");
    assert.equal(looksLikeIncompletePlan(long), false);
  });
});
