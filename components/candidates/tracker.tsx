"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AlertCircleIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";

import { formatMan } from "@/components/affordability/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { evaluatePrice } from "@/lib/affordability";
import type { BindingConstraint } from "@/lib/affordability";
import {
  parseSaved,
  readSaved,
  subscribeNothing,
  toBasis,
  toInput,
} from "@/lib/affordability/saved";
import {
  CANDIDATES_KEY,
  listingGap,
  parseCandidates,
  priceBasis,
} from "@/lib/candidates";
import type { Candidate, Market, Note } from "@/lib/candidates";
import { summarizeTrades } from "@/lib/trades";
import type { Trade } from "@/lib/trades";
import { seoulDistricts } from "@/lib/trades/districts";

const bindingLabels: Record<BindingConstraint, string> = {
  ltv: "LTV(담보인정비율)",
  cap: "주택 시가별 대출 한도",
  dsr: "DSR(총부채원리금상환비율)",
};

const districtName = (code: string) =>
  seoulDistricts.find((district) => district.code === code)?.name ?? code;

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function readCandidates(): string | null {
  try {
    return window.localStorage.getItem(CANDIDATES_KEY);
  } catch {
    // 저장소를 쓸 수 없어도 화면은 정상 동작해야 한다.
    return null;
  }
}

type SearchState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; trades: Trade[]; fetchedAt: string }
  | { phase: "error"; kind: "missing-key" | "upstream" | "network" | "bad-request" };

const errorMessages: Record<
  Extract<SearchState, { phase: "error" }>["kind"],
  string
> = {
  "missing-key":
    "서버에 공공데이터포털 인증키가 설정되어 있지 않습니다. .env.local에 DATA_GO_KR_API_KEY를 넣고 서버를 다시 시작해 주세요.",
  upstream:
    "국토교통부 실거래가 조회에 실패했습니다. 인증키가 올바른지, 일일 호출 한도를 넘지 않았는지 확인해 주세요.",
  network: "서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
  "bad-request": "구와 단지명을 확인해 주세요.",
};

function TextField({
  id,
  label,
  value,
  onChange,
  unit,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit?: string;
  type?: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>
        {label}
        {unit ? (
          <span className="font-normal text-muted-foreground"> ({unit})</span>
        ) : null}
      </FieldLabel>
      <Input
        id={id}
        type={type}
        inputMode={type === "text" ? "decimal" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

// 서버에서는 저장값이 없으므로(undefined) 기본 화면으로 그리고,
// 브라우저에서 저장값을 읽는 순간 한 번만 그 값으로 다시 시작한다.
export function CandidateTracker() {
  const candidatesRaw = useSyncExternalStore(
    subscribeNothing,
    readCandidates,
    () => undefined
  );
  const affordabilityRaw = useSyncExternalStore(
    subscribeNothing,
    readSaved,
    () => undefined
  );
  return (
    <TrackerBody
      key={candidatesRaw === undefined ? "server" : "browser"}
      initial={parseCandidates(candidatesRaw)}
      affordabilityRaw={affordabilityRaw ?? null}
      persist={candidatesRaw !== undefined}
    />
  );
}

function TrackerBody({
  initial,
  affordabilityRaw,
  persist,
}: {
  initial: Candidate[];
  affordabilityRaw: string | null;
  persist: boolean;
}) {
  const [candidates, setCandidates] = useState<Candidate[]>(initial);

  useEffect(() => {
    if (!persist) return;
    try {
      window.localStorage.setItem(CANDIDATES_KEY, JSON.stringify(candidates));
    } catch {
      // 위와 같다.
    }
  }, [candidates, persist]);

  const saved = useMemo(() => parseSaved(affordabilityRaw), [affordabilityRaw]);
  const input = useMemo(() => toInput(saved.form), [saved]);
  const basis = useMemo(() => toBasis(saved.policy), [saved]);

  const update = (id: string, patch: Partial<Candidate>) =>
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === id ? { ...candidate, ...patch } : candidate
      )
    );

  const evaluations = useMemo(
    () =>
      candidates.map((candidate) => {
        const priced = priceBasis(candidate);
        if (!priced || !basis) return { candidate, priced, result: null };
        return {
          candidate,
          priced,
          result: evaluatePrice(input, basis, priced.price),
        };
      }),
    [candidates, input, basis]
  );

  const calculationReady =
    basis !== null &&
    evaluatePrice(input, basis, 1).status === "ok";

  return (
    <div className="flex flex-col gap-6">
      {!calculationReady ? (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>구매력 입력이 아직 없습니다</AlertTitle>
          <AlertDescription>
            후보지와 내 구매력을 비교하려면 먼저 자산과 소득을 입력해 주세요.{" "}
            <Link href="/" className="font-medium text-foreground underline underline-offset-4">
              구매력 계산으로 가기
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <RegisterCard
        onAdd={(candidate) => setCandidates((current) => [candidate, ...current])}
      />

      {candidates.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>등록한 후보지가 없습니다</CardTitle>
            <CardDescription>
              위에서 구와 단지명으로 조회해 관심 단지를 등록해 보세요.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>후보지 비교</CardTitle>
              <CardDescription>
                호가가 있으면 호가, 없으면 최근 실거래가 기준으로 내 구매력과 비교합니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>단지</TableHead>
                      <TableHead className="text-right">호가</TableHead>
                      <TableHead className="text-right">최근 실거래가</TableHead>
                      <TableHead>살 수 있나</TableHead>
                      <TableHead className="text-right">월 상환액</TableHead>
                      <TableHead className="text-right">실질 소득(월)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {evaluations.map(({ candidate, priced, result }) => (
                      <TableRow key={candidate.id}>
                        <TableCell className="font-medium">
                          {candidate.complex}
                          {candidate.area ? ` ${candidate.area}㎡` : ""}
                        </TableCell>
                        <TableCell className="text-right">
                          {priced?.basis === "listing"
                            ? formatMan(priced.price)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {candidate.market ? formatMan(candidate.market.price) : "-"}
                        </TableCell>
                        <TableCell>
                          {result?.status === "ok" ? (
                            <Badge variant={result.affordable ? "default" : "destructive"}>
                              {result.affordable ? "가능" : "부족"}
                            </Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {result?.status === "ok" ? formatMan(result.monthlyPayment) : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {result?.status === "ok" ? formatMan(result.netMonthlyIncome) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {evaluations.map(({ candidate, priced, result }) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              priced={priced}
              result={result}
              onChange={(patch) => update(candidate.id, patch)}
              onDelete={() =>
                setCandidates((current) =>
                  current.filter((item) => item.id !== candidate.id)
                )
              }
            />
          ))}
        </>
      )}
    </div>
  );
}

function RegisterCard({ onAdd }: { onAdd: (candidate: Candidate) => void }) {
  const [district, setDistrict] = useState<string>(seoulDistricts[0].code);
  const [name, setName] = useState("");
  const [search, setSearch] = useState<SearchState>({ phase: "idle" });
  const [manualArea, setManualArea] = useState("");
  const [manualPrice, setManualPrice] = useState("");

  async function lookup() {
    if (!name.trim()) {
      setSearch({ phase: "error", kind: "bad-request" });
      return;
    }
    setSearch({ phase: "loading" });
    try {
      const response = await fetch(
        `/api/trades?district=${district}&name=${encodeURIComponent(name.trim())}`
      );
      const body = await response.json();
      if (!response.ok) {
        const kind =
          body.error === "missing-key" || body.error === "bad-request"
            ? body.error
            : "upstream";
        setSearch({ phase: "error", kind });
        return;
      }
      setSearch({ phase: "done", trades: body.trades, fetchedAt: body.fetchedAt });
    } catch {
      setSearch({ phase: "error", kind: "network" });
    }
  }

  // 같은 단지와 전용면적끼리 묶어 선택지로 보여준다.
  const options = useMemo(() => {
    if (search.phase !== "done") return [];
    const seen = new Map<string, Trade>();
    for (const trade of search.trades) {
      seen.set(`${trade.complex}|${trade.area}`, trade);
    }
    return [...seen.values()].sort(
      (a, b) => a.complex.localeCompare(b.complex) || a.area - b.area
    );
  }, [search]);

  function register(trade: Trade) {
    if (search.phase !== "done") return;
    const summary = summarizeTrades(search.trades, trade.complex, trade.area);
    if (!summary) return;
    const market: Market = {
      price: summary.latest.price,
      date: summary.latest.date,
      min: summary.min,
      max: summary.max,
      count: summary.count,
      fetchedAt: search.fetchedAt,
      source: "api",
    };
    onAdd({
      id: newId(),
      district,
      complex: trade.complex,
      dong: trade.dong,
      area: trade.area,
      market,
      listing: "",
      households: "",
      builtYear: trade.buildYear ? String(trade.buildYear) : "",
      notes: [],
    });
  }

  function registerManually() {
    const price = Number(manualPrice);
    const area = Number(manualArea);
    if (!name.trim() || !Number.isFinite(price) || price <= 0) return;
    onAdd({
      id: newId(),
      district,
      complex: name.trim(),
      dong: "",
      area: Number.isFinite(area) && area > 0 ? area : null,
      market: {
        price,
        date: null,
        min: null,
        max: null,
        count: 0,
        fetchedAt: null,
        source: "manual",
      },
      listing: "",
      households: "",
      builtYear: "",
      notes: [],
    });
    setManualArea("");
    setManualPrice("");
  }

  const showManual = search.phase === "error" || (search.phase === "done" && options.length === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>단지 등록</CardTitle>
        <CardDescription>
          구와 단지명을 넣으면 국토교통부 실거래가에서 최근 6개월 거래를 찾아 줍니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end">
            <Field>
              <FieldLabel htmlFor="district">구</FieldLabel>
              <Select
                value={district}
                items={seoulDistricts.map((item) => ({ value: item.code, label: item.name }))}
                onValueChange={(value) => {
                  if (value) setDistrict(value);
                }}
              >
                <SelectTrigger id="district" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {seoulDistricts.map((item) => (
                    <SelectItem key={item.code} value={item.code}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <TextField
              id="complexName"
              label="단지명"
              type="search"
              value={name}
              onChange={setName}
            />
            <Button
              type="button"
              onClick={lookup}
              disabled={search.phase === "loading"}
            >
              <SearchIcon data-icon="inline-start" />
              {search.phase === "loading" ? "조회 중" : "실거래가 조회"}
            </Button>
          </div>

          {search.phase === "error" ? (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>실거래가를 가져오지 못했습니다</AlertTitle>
              <AlertDescription>{errorMessages[search.kind]}</AlertDescription>
            </Alert>
          ) : null}

          {search.phase === "done" && options.length === 0 ? (
            <Alert>
              <AlertCircleIcon />
              <AlertTitle>일치하는 거래가 없습니다</AlertTitle>
              <AlertDescription>
                최근 6개월 신고된 거래에서 단지명을 찾지 못했습니다. 이름을 줄여서 다시 조회하거나, 아래에서 직접 입력해 등록할 수 있습니다.
              </AlertDescription>
            </Alert>
          ) : null}

          {options.length > 0 && search.phase === "done" ? (
            <ul className="flex flex-col gap-2">
              {options.map((trade) => {
                const summary = summarizeTrades(search.trades, trade.complex, trade.area);
                return (
                  <li
                    key={`${trade.complex}|${trade.area}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">
                        {trade.complex} · {trade.area}㎡
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {trade.dong}
                        {trade.buildYear ? ` · ${trade.buildYear}년 준공` : ""}
                        {summary
                          ? ` · 최근 ${formatMan(summary.latest.price)} (${summary.latest.date}), 거래 ${summary.count}건`
                          : ""}
                      </span>
                    </div>
                    <Button type="button" variant="outline" onClick={() => register(trade)}>
                      <PlusIcon data-icon="inline-start" />
                      후보지로 등록
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {showManual ? (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
              <p className="text-sm font-medium">직접 입력으로 등록</p>
              <p className="text-sm text-muted-foreground">
                위에서 고른 구와 입력한 단지명으로 등록합니다.
              </p>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <TextField
                  id="manualArea"
                  label="전용면적"
                  unit="㎡"
                  value={manualArea}
                  onChange={setManualArea}
                />
                <TextField
                  id="manualPrice"
                  label="최근 실거래가"
                  unit="만원"
                  value={manualPrice}
                  onChange={setManualPrice}
                />
                <Button type="button" variant="outline" onClick={registerManually}>
                  <PlusIcon data-icon="inline-start" />
                  직접 입력으로 등록
                </Button>
              </div>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            출처: 국토교통부 아파트 매매 실거래가 자료(공공데이터포털). 거래 신고에는 시차가 있어 가장 최근 거래가 빠질 수 있습니다.
          </p>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function CandidateCard({
  candidate,
  priced,
  result,
  onChange,
  onDelete,
}: {
  candidate: Candidate;
  priced: ReturnType<typeof priceBasis>;
  result: ReturnType<typeof evaluatePrice> | null;
  onChange: (patch: Partial<Candidate>) => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [noteDate, setNoteDate] = useState(today);
  const [noteText, setNoteText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const gap = listingGap(candidate);
  const idPrefix = `c-${candidate.id}`;

  function addNote() {
    if (!noteText.trim()) return;
    const note: Note = { id: newId(), date: noteDate, text: noteText.trim() };
    onChange({ notes: [note, ...candidate.notes] });
    setNoteText("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {candidate.complex}
          {candidate.area ? ` · ${candidate.area}㎡` : ""}
        </CardTitle>
        <CardDescription>
          서울 {districtName(candidate.district)}
          {candidate.dong ? ` ${candidate.dong}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              id={`${idPrefix}-listing`}
              label="호가"
              unit="만원"
              value={candidate.listing}
              onChange={(listing) => onChange({ listing })}
            />
            <TextField
              id={`${idPrefix}-households`}
              label="세대수"
              unit="세대"
              value={candidate.households}
              onChange={(households) => onChange({ households })}
            />
            <TextField
              id={`${idPrefix}-built`}
              label="준공연도"
              unit="년"
              value={candidate.builtYear}
              onChange={(builtYear) => onChange({ builtYear })}
            />
          </div>
        </FieldGroup>

        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">최근 실거래가</dt>
            <dd className="text-lg font-medium">
              {candidate.market ? formatMan(candidate.market.price) : "-"}
            </dd>
            <dd className="text-sm text-muted-foreground">
              {candidate.market?.source === "api"
                ? `${candidate.market.date} 거래 · 최근 6개월 ${formatMan(candidate.market.min ?? 0)}~${formatMan(candidate.market.max ?? 0)}, ${candidate.market.count}건 · ${candidate.market.fetchedAt} 조회 (국토교통부)`
                : candidate.market
                  ? "직접 입력한 값"
                  : "실거래가 없음"}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">호가와 실거래가의 차이</dt>
            <dd className="text-lg font-medium">
              {gap
                ? `${gap.amount >= 0 ? "+" : ""}${formatMan(gap.amount)} (${gap.percent >= 0 ? "+" : ""}${gap.percent.toFixed(1)}%)`
                : "-"}
            </dd>
          </div>
        </dl>

        {result?.status === "ok" ? (
          <div className="flex flex-col gap-2 rounded-lg bg-muted p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={result.affordable ? "default" : "destructive"}>
                {result.affordable ? "가능" : "부족"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {priced?.basis === "market"
                  ? "호가가 없어 최근 실거래가 기준"
                  : "호가 기준"}
                {" "}{priced ? formatMan(priced.price) : ""}
              </span>
            </div>
            <p className="text-sm">
              필요한 대출액 {formatMan(result.loan)} · 대출 한도 {formatMan(result.loanLimit)}
              {result.affordable ? "" : ` · 부족액 ${formatMan(result.shortfall)}`}
            </p>
            <p className="text-sm">
              월 상환액 {formatMan(result.monthlyPayment)} · 상환 후 실질 소득 {formatMan(result.netMonthlyIncome)}
            </p>
            <p className="text-sm text-muted-foreground">
              대출 한도를 정한 규제: {bindingLabels[result.binding]}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            구매력 입력이 있고 가격이 정해지면 여기에서 비교 결과를 보여줍니다.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-semibold">임장기</h3>
          <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <TextField
              id={`${idPrefix}-notedate`}
              label="방문일"
              type="date"
              value={noteDate}
              onChange={setNoteDate}
            />
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-notetext`}>임장 기록</FieldLabel>
              <Textarea
                id={`${idPrefix}-notetext`}
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
              />
            </Field>
          </div>
          <div>
            <Button type="button" variant="outline" onClick={addNote}>
              <PlusIcon data-icon="inline-start" />
              임장기 추가
            </Button>
          </div>

          {candidate.notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 남긴 임장기가 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {candidate.notes.map((note) => (
                <li key={note.id} className="flex flex-col gap-2 rounded-lg border p-3">
                  <span className="text-sm text-muted-foreground">{note.date}</span>
                  {editing === note.id ? (
                    <>
                      <Textarea
                        aria-label="임장기 수정"
                        value={editText}
                        onChange={(event) => setEditText(event.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            onChange({
                              notes: candidate.notes.map((item) =>
                                item.id === note.id ? { ...item, text: editText.trim() } : item
                              ),
                            });
                            setEditing(null);
                          }}
                        >
                          저장
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)}>
                          취소
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap text-sm">{note.text}</p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditing(note.id);
                            setEditText(note.text);
                          }}
                        >
                          수정
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            onChange({
                              notes: candidate.notes.filter((item) => item.id !== note.id),
                            })
                          }
                        >
                          삭제
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t pt-4">
          {confirming ? (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>이 후보지를 삭제할까요?</AlertTitle>
              <AlertDescription>
                <p>임장기 {candidate.notes.length}건도 함께 사라지고 되돌릴 수 없습니다.</p>
                <div className="mt-3 flex gap-2">
                  <Button type="button" size="sm" variant="destructive" onClick={onDelete}>
                    삭제
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)}>
                    취소
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : (
            <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
              <Trash2Icon data-icon="inline-start" />
              후보지 삭제
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

