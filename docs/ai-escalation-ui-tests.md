# CAREBOX — Real UI Test Scenarios for AI Escalation

Use these seven scenarios to verify AI escalation, ordinary chat, manual handoff, service workflows, and safety handling in the real CAREBOX UI.

## Preparation

Open CAREBOX in two browsers or devices:

- **Browser A:** Log in as `ba.lan` (elderly user).
- **Browser B:** Log in as `con.gai` (family member).
- Configure `GEMINI_API_KEY` and confirm Gemma 4 26B A4B is responding to free-form chat.
- Allow approximately **3 seconds** for changes to appear on the family side.
- Start each scenario with a fresh demo reset, or otherwise record existing alerts first so you can identify **new** alerts.

## UI test scenarios

| # | Scenario | Messages / actions | Expected result |
| --- | --- | --- | --- |
| 1 | Normal conversation | “Cháu kể chuyện vui cho bác nghe đi.” → “Kể tiếp đi cháu.” | Gemma 4 26B A4B responds naturally. No **new** misunderstanding alert for the family. |
| 2 | Two unclear requests | “Bác muốn nhờ làm cái việc hôm trước ấy.” → “Cái việc mà bác đã nói lần trước đó.” | CAREBOX asks once for clarification, then escalates to Chị Minh **if Gemma 4 26B A4B marks both requests unclear**. |
| 3 | Understanding resets escalation | “Bác muốn làm cái đó ấy.” → “Cháu kể chuyện cho bác nghe đi.” → “Bác muốn cái hồi trước.” | If Gemma 4 26B A4B marks the first and third unclear but understands the middle message, no handoff occurs. |
| 4 | Manual escalation | Press **Nhờ con giúp**. | Creates a new alert for Chị Minh immediately, without needing two unclear messages. |
| 5 | Recognized service request | “Bác muốn mua thuốc.” | Starts collecting service details; no misunderstanding escalation. |
| 6 | Emergency | “Bác đau ngực.” | The emergency workflow activates immediately and bypasses Gemma 4 26B A4B’s ordinary-chat path. |
| 7 | Medication safety | “Bác muốn tăng liều thuốc.” | CAREBOX refuses to change medication or dosage and creates the corresponding event. |

## Detailed test: Automatic AI escalation

### Step 1 — Bà Lan sends

> Bác muốn nhờ làm cái việc hôm trước ấy.

If Gemma 4 26B A4B marks the request unclear, CAREBOX should respond along these lines:

> Cháu chưa hiểu ý bác. Bác nói lại ngắn gọn giúp cháu nhé. Hoặc bác bấm “Nhờ con giúp”.

### Step 2 — Bà Lan sends

> Cái việc mà bác đã nói lần trước đó.

If Gemma 4 26B A4B again marks the request unclear, CAREBOX should respond:

> Cháu đã báo Chị Minh gọi lại cho bác ạ.

### Step 3 — Check Chị Minh’s account

Verify that:

- A new **AI chưa hiểu yêu cầu** alert appears.
- The alert priority is **Uncertain**.
- Both unclear messages are recorded.
- A notification is created for Chị Minh.
- Chị Minh can receive and resolve the alert.

## Additional test: Gemma 4 26B A4B response formatting

Send:

> Cháu có biết làm thơ không?

**Expected:** A natural Vietnamese answer. The UI should show only the reply text.

**Unexpected:** The raw JSON envelope appearing in the chat, for example:

```json
{
  "status": "answered",
  "reply": "Dạ có ạ..."
}
```

Also watch for provider errors. An incorrectly structured Gemma response should produce a friendly chat error instead of showing raw JSON.

## Important limitations

Gemma 4 26B A4B decides whether a message is genuinely unclear. **Scenario 2 is probabilistic**: the model might interpret either vague message as ordinary conversation, or ask a clarifying question while marking it `answered`.

If automatic escalation does not occur, first inspect whether Gemma 4 26B A4B returned `answered` or `unclear`; the absence of a handoff alone does not prove the server-side handoff logic is broken.

**Recommended order:** 1 → 2 → 3 → 4 → 5 → 6 → 7.

These are **manual test instructions**, not browser test results. Automated tests previously passed, but live Gemma classification and UI behavior remain to be verified.
