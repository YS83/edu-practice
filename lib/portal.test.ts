import { describe, expect, test } from "vitest";

import { readPortal } from "@/lib/portal";

describe("readPortal", () => {
  test("XML 응답에서 결과 코드, 메시지, item 목록을 읽는다", () => {
    const xml = `<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
<body><items><item><kaptCode>A1</kaptCode><kaptName>단지 하나</kaptName></item>
<item><kaptCode>A2</kaptCode><kaptName></kaptName></item></items></body></response>`;

    expect(readPortal(xml)).toEqual({
      code: "00",
      message: "NORMAL SERVICE.",
      items: [
        { kaptCode: "A1", kaptName: "단지 하나" },
        { kaptCode: "A2", kaptName: "" },
      ],
    });
  });

  test("JSON 응답의 items 배열을 같은 형태로 읽고 null 값은 빈 문자열로 둔다", () => {
    const json = JSON.stringify({
      response: {
        header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
        body: {
          items: [
            { kaptCode: "A1", kaptName: "단지 하나", as4: null, kaptdaCnt: 120 },
          ],
        },
      },
    });

    expect(readPortal(json)).toEqual({
      code: "00",
      message: "NORMAL SERVICE.",
      items: [{ kaptCode: "A1", kaptName: "단지 하나", as4: "", kaptdaCnt: "120" }],
    });
  });

  test("JSON 응답의 item 객체 하나나 items.item 배열도 목록으로 읽는다", () => {
    const single = JSON.stringify({
      response: { header: { resultCode: "00" }, body: { item: { kaptCode: "A1" } } },
    });
    const nested = JSON.stringify({
      response: {
        header: { resultCode: "00" },
        body: { items: { item: [{ kaptCode: "A1" }, { kaptCode: "A2" }] } },
      },
    });

    expect(readPortal(single).items).toEqual([{ kaptCode: "A1" }]);
    expect(readPortal(nested).items).toEqual([{ kaptCode: "A1" }, { kaptCode: "A2" }]);
  });

  test("형식을 알 수 없는 본문은 코드 없이 빈 목록이다", () => {
    expect(readPortal("<html>oops</html>")).toEqual({ code: null, message: null, items: [] });
    expect(readPortal("{not json")).toEqual({ code: null, message: null, items: [] });
  });
});
