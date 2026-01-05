import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export type ExportItem = {
  id: string;
  siteId?: string | null;
  siteName?: string | null;
  [key: string]: unknown;
};

export type DailyItem = {
  contractId?: string;
  personName?: string;
  day?: string;
  workedMinutes?: number;
  totalDurationMinutes?: number;
  clockRecordsCount?: number;
  stampingLocations?: string[];
  entryLocation?: string;
  entryTime?: string;
  entryDeviceType?: string;
  exitLocation?: string;
  exitTime?: string;
  exitDeviceType?: string;
  plannedShift?: string;
  plannedLocation?: string;
  [key: string]: unknown;
};

export type DailyResponse = {
  date: string;
  items: DailyItem[];
};

export type Site = {
  id: string;
  name: string;
  keywords: string[];
};

export type Contract = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  raw?: unknown;
};

type ExportParams = {
  mock?: boolean;
  count?: number;
  from_date?: string;
  to_date?: string;
};

type DailyParams = {
  date: string;
  include_calendar?: boolean;
  mock?: boolean;
};

function getAccessToken() {
  if (typeof window === "undefined") return null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  try {
    const host = new URL(supabaseUrl).hostname;
    const projectRef = host.split(".")[0];
    const key = `sb-${projectRef}-auth-token`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { access_token?: string };
    return parsed.access_token ?? null;
  } catch {
    return null;
  }
}

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api",
    prepareHeaders: (headers) => {
      const token = getAccessToken();
      if (token) {
        headers.set("authorization", `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ["Exports", "Daily", "Sites", "Contracts", "FluidaSync"],
  endpoints: (builder) => ({
    getExports: builder.query<ExportItem[], ExportParams>({
      query: (params) => ({
        url: "exports",
        params: {
          mock: params?.mock ? 1 : 0,
          count: params?.count,
          from_date: params?.from_date,
          to_date: params?.to_date,
        },
      }),
      providesTags: ["Exports"],
    }),
    getDailySummary: builder.query<DailyResponse, DailyParams>({
      query: (params) => ({
        url: "daily_summary",
        params: {
          date: params.date,
          include_calendar: params.include_calendar ? 1 : 0,
          mock: params.mock ? 1 : 0,
          format: "json",
        },
      }),
      providesTags: ["Daily"],
    }),
    getSites: builder.query<Site[], void>({
      query: () => "sites",
      providesTags: ["Sites"],
    }),
    createSite: builder.mutation<Site, { name: string; keywords?: string[] | string }>({
      query: (body) => ({
        url: "sites",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Sites"],
    }),
    associate: builder.mutation<{ ok: boolean }, { recordId: string; siteId?: string | null }>({
      query: (body) => ({
        url: "associate",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Exports"],
    }),
    getContracts: builder.query<Contract[], { mock?: boolean }>({
      query: (params) => ({
        url: "contracts",
        params: {
          mock: params?.mock ? 1 : 0,
        },
      }),
      providesTags: ["Contracts"],
    }),
  }),
});

export const {
  useLazyGetExportsQuery,
  useLazyGetDailySummaryQuery,
  useLazyGetContractsQuery,
  useGetSitesQuery,
  useAssociateMutation,
} = api;
