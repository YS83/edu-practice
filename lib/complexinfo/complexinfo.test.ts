import { describe, expect, test } from "vitest";

import { findComplexes, parseComplexInfo, parseComplexList } from "@/lib/complexinfo";

const listXml = `<response><header><resultCode>00</resultCode></header><body><items>
<item><kaptCode>A10027875</kaptCode><kaptName>래미안퍼스티지</kaptName><as1>서울특별시</as1><as2>서초구</as2><as3>반포동</as3><as4>1-1</as4></item>
<item><kaptCode>A10027000</kaptCode><kaptName>반포자이</kaptName><as1>서울특별시</as1><as2>서초구</as2><as3>반포동</as3></item>
<item><kaptCode></kaptCode><kaptName>코드 없음</kaptName></item>
</items></body></response>`;

const basisXml = `<response><header><resultCode>00</resultCode></header><body><item>
<kaptCode>A10027875</kaptCode><kaptName>래미안퍼스티지</kaptName>
<kaptdaCnt>2444</kaptdaCnt><kaptUsedate>20090818</kaptUsedate>
</item></body></response>`;

const detailXml = `<response><header><resultCode>00</resultCode></header><body><item>
<kaptCode>A10027875</kaptCode><kaptdPcnt>120</kaptdPcnt><kaptdPcntu>2940</kaptdPcntu>
</item></body></response>`;

describe("parseComplexList", () => {
  test("단지코드가 있는 단지만 이름과 주소와 함께 읽는다", () => {
    expect(parseComplexList(listXml)).toEqual([
      { code: "A10027875", name: "래미안퍼스티지", address: "서울특별시 서초구 반포동 1-1" },
      { code: "A10027000", name: "반포자이", address: "서울특별시 서초구 반포동" },
    ]);
  });
});

describe("findComplexes", () => {
  test("띄어쓰기와 대소문자를 무시하고 단지명에 입력이 포함된 단지만 남긴다", () => {
    const complexes = parseComplexList(listXml);

    expect(findComplexes(complexes, "래미안 퍼스티지").map((c) => c.code)).toEqual(["A10027875"]);
    expect(findComplexes(complexes, "자이")).toHaveLength(1);
    expect(findComplexes(complexes, "없는단지")).toEqual([]);
    expect(findComplexes(complexes, "  ")).toEqual([]);
  });
});

describe("parseComplexInfo", () => {
  test("기본정보와 상세정보에서 세대수, 준공연도, 지상·지하 주차 대수를 읽는다", () => {
    expect(parseComplexInfo(basisXml, detailXml)).toEqual({
      households: 2444,
      builtYear: 2009,
      parkingGround: 120,
      parkingUnderground: 2940,
    });
  });

  test("없거나 숫자가 아닌 값은 null로 둔다", () => {
    const sparseBasis = `<response><body><item><kaptdaCnt></kaptdaCnt></item></body></response>`;
    const sparseDetail = `<response><body><item><kaptdPcnt>abc</kaptdPcnt></item></body></response>`;

    expect(parseComplexInfo(sparseBasis, sparseDetail)).toEqual({
      households: null,
      builtYear: null,
      parkingGround: null,
      parkingUnderground: null,
    });
  });
});

describe("JSON 응답", () => {
  test("실제 API처럼 JSON으로 와도 단지 목록을 읽고 null 주소 조각은 건너뛴다", () => {
    const json = JSON.stringify({
      response: {
        header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
        body: {
          items: [
            { kaptCode: "A10019911", kaptName: "디에이치방배", as1: "서울특별시", as2: "서초구", as3: "방배동", as4: null },
          ],
        },
      },
    });

    expect(parseComplexList(json)).toEqual([
      { code: "A10019911", name: "디에이치방배", address: "서울특별시 서초구 방배동" },
    ]);
  });

  test("기본정보와 상세정보가 JSON으로 와도 세대수, 준공연도, 주차 대수를 읽는다", () => {
    const basis = JSON.stringify({
      response: { header: { resultCode: "00" }, body: { item: { kaptdaCnt: "2444", kaptUsedate: "20090818" } } },
    });
    const detail = JSON.stringify({
      response: { header: { resultCode: "00" }, body: { item: { kaptdPcnt: "120", kaptdPcntu: "2940" } } },
    });

    expect(parseComplexInfo(basis, detail)).toEqual({
      households: 2444,
      builtYear: 2009,
      parkingGround: 120,
      parkingUnderground: 2940,
    });
  });
});
