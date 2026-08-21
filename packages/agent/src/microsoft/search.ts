import { getMicrosoftAccessToken } from "./auth";
import { graphRequest } from "./graph";

interface SearchHit {
  resource?: {
    id?: string;
    name?: string;
    subject?: string;
    from?: { emailAddress?: { address?: string; name?: string } };
    start?: { dateTime?: string };
    end?: { dateTime?: string };
    receivedDateTime?: string;
    webUrl?: string;
    size?: number;
    folder?: { childCount?: number } | null;
    file?: { mimeType?: string } | null;
    parentReference?: { id?: string };
    bodyPreview?: string;
    summary?: string;
    displayName?: string;
    mail?: string;
    jobTitle?: string;
    companyName?: string;
    content?: string;
  };
  rank?: number;
}

export type M365EntityType =
  | "message"
  | "event"
  | "driveItem"
  | "listItem"
  | "person";

const VALID_ENTITY_TYPES: M365EntityType[] = [
  "message",
  "event",
  "driveItem",
  "listItem",
  "person",
];

const ENTITY_SELECT_FIELDS: Partial<Record<M365EntityType, string[]>> = {
  message: [
    "id",
    "subject",
    "from",
    "toRecipients",
    "bodyPreview",
    "receivedDateTime",
    "hasAttachments",
    "webLink",
  ],
  event: ["id", "subject", "start", "end", "location", "webLink"],
  driveItem: ["id", "name", "size", "folder", "file", "webUrl", "parentReference"],
  listItem: ["id", "title", "sharepointIds", "webUrl"],
  person: ["id", "displayName", "mail", "jobTitle", "companyName"],
};

const AGGREGATION_SUPPORTED = ["driveItem", "listItem"];
const COLLAPSE_SUPPORTED = ["driveItem", "listItem", "message"];

function buildSmartKQLQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return "*";
  // Quote multi-word phrases so they're matched as a whole.
  if (/\s/.test(trimmed) && !/^".*"$/.test(trimmed)) {
    return `"${trimmed.replace(/"/g, "'")}"`;
  }
  return trimmed;
}

function includeAggregations(entityTypes: M365EntityType[]): boolean {
  return entityTypes.some((t) => AGGREGATION_SUPPORTED.includes(t));
}

function includeCollapse(entityTypes: M365EntityType[]): boolean {
  return entityTypes.some((t) => COLLAPSE_SUPPORTED.includes(t));
}

export async function searchM365(
  doctorId: string,
  params: {
    query?: string;
    entityTypes?: M365EntityType[];
    peopleSearch?: string;
    maxResults?: number;
    dateFrom?: string;
    dateTo?: string;
    fileTypes?: string[];
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const entityTypes: M365EntityType[] = (params.entityTypes ?? []).length
    ? (params.entityTypes! as M365EntityType[]).filter((t) =>
        VALID_ENTITY_TYPES.includes(t)
      )
    : ["driveItem", "listItem"];

  if (entityTypes.length === 0) {
    throw new Error("No valid entityTypes provided");
  }

  const queryString = params.peopleSearch
    ? `* "${params.peopleSearch.replace(/"/g, "'")}"*`
    : buildSmartKQLQuery(params.query ?? "");

  const request: Record<string, unknown> = {
    entityTypes,
    query: { queryString },
    from: 0,
    size: params.maxResults ?? 25,
  };

  const selectFields = entityTypes
    .map((t) => ENTITY_SELECT_FIELDS[t] ?? [])
    .flat();
  request.fields = selectFields;

  if (params.fileTypes && params.fileTypes.length > 0) {
    const fileTypeClause = params.fileTypes
      .map((ft) => `fileType:${ft}`)
      .join(" OR ");
    request.query = {
      queryString: `(${fileTypeClause}) AND ${queryString}`,
    };
  }

  if (includeAggregations(entityTypes)) {
    request.aggregations = [
      { field: "fileType", size: 10 },
      { field: "lastModifiedBy", size: 10 },
    ];
  }

  if (includeCollapse(entityTypes)) {
    request.collapseProperties = [{ field: "id" }];
  }

  let data: {
    value?: Array<{
      searchTerms?: string[];
      hitsContainers?: Array<{ hits?: SearchHit[]; total?: number }>;
    }>;
  };
  try {
    data = await graphRequest<{
      value?: Array<{
        searchTerms?: string[];
        hitsContainers?: Array<{ hits?: SearchHit[]; total?: number }>;
      }>;
    }>(token, "/search/query", { method: "POST", body: JSON.stringify({ requests: [request] }) });
  } catch (err) {
    const msg = (err as Error).message;
    if (/MSA|not supported|no addressUrl/i.test(msg)) {
      throw new Error(
        "Microsoft Search (/search/query) is only available for work or school (Azure AD) accounts, not personal Outlook.com/MSA accounts. Use the individual search tools (searchOutlookMessages, searchOneDrive) instead."
      );
    }
    throw err;
  }

  const container = data.value?.[0]?.hitsContainers?.[0];
  const results = (container?.hits ?? []).map((h) => {
    const r = h.resource ?? {};
    return {
      rank: h.rank ?? null,
      id: r.id ?? null,
      name: r.name ?? r.displayName ?? r.subject ?? "(unnamed)",
      type: r.folder ? "folder" : r.file ? "file" : null,
      size: r.size ?? null,
      webUrl: r.webUrl ?? null,
      snippet: r.bodyPreview ?? r.summary ?? r.content ?? null,
      date: r.receivedDateTime ?? r.start?.dateTime ?? null,
      parentFolderId: r.parentReference?.id ?? null,
      mimeType: r.file?.mimeType ?? null,
      from: r.from?.emailAddress?.address ?? null,
      fromName: r.from?.emailAddress?.name ?? null,
      email: r.mail ?? null,
      jobTitle: r.jobTitle ?? null,
      companyName: r.companyName ?? null,
    };
  });

  return {
    results,
    total: container?.total ?? results.length,
    searchTerms: data.value?.[0]?.searchTerms ?? [],
  };
}