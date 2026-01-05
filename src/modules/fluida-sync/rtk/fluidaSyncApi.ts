import { api } from "@/services/api";

export type FluidaSyncStatus = {
  organizationId: string;
  companyId: string | null;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  windowDays: number;
  lastLog?: {
    id: string;
    status: string;
    rangeFrom: string;
    rangeTo: string;
    startedAt: string;
    finishedAt: string | null;
    recordsFetched: number;
    recordsInserted: number;
    recordsUpdated: number;
    recordsSkipped: number;
  } | null;
};

export type FluidaSyncLog = {
  id: string;
  organizationId: string;
  companyId: string | null;
  status: string;
  rangeFrom: string;
  rangeTo: string;
  startedAt: string;
  finishedAt: string | null;
  recordsFetched: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errors?: unknown;
};

export type FluidaSyncResponse = {
  status: FluidaSyncStatus;
  logs: FluidaSyncLog[];
};

export type FluidaSyncSettings = {
  apiUrl: string;
  authMethod: "apikey" | "oauth";
  apiKeyHeader: string;
  companyId: string | null;
  hasApiKey: boolean;
  hasOauthToken: boolean;
};

export type FluidaSyncSettingsResponse = {
  settings: FluidaSyncSettings | null;
  windowDays: number;
};

export type RunFluidaSyncResponse = {
  ok: boolean;
  logId?: string;
  stats?: {
    fetched: number;
    inserted: number;
    updated: number;
    skipped: number;
    dirtyDays: number;
  };
  error?: string;
};

export const fluidaSyncApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getFluidaSyncStatus: builder.query<
      FluidaSyncResponse,
      { organizationId: string; limit?: number }
    >({
      query: ({ organizationId, limit }) => ({
        url: "fluida_sync",
        params: {
          organizationId,
          limit,
        },
      }),
      providesTags: ["FluidaSync"],
    }),
    getFluidaSyncSettings: builder.query<
      FluidaSyncSettingsResponse,
      { organizationId: string }
    >({
      query: ({ organizationId }) => ({
        url: "fluida_sync/settings",
        params: { organizationId },
      }),
      providesTags: ["FluidaSync"],
    }),
    saveFluidaSyncSettings: builder.mutation<
      { ok: boolean },
      {
        organizationId: string;
        apiUrl: string;
        authMethod: "apikey" | "oauth";
        apiKeyHeader?: string;
        companyId?: string | null;
        apiKey?: string;
        oauthToken?: string;
        windowDays?: number;
      }
    >({
      query: ({ organizationId, ...body }) => ({
        url: "fluida_sync/settings",
        method: "POST",
        params: { organizationId },
        body,
      }),
      invalidatesTags: ["FluidaSync"],
    }),
    runFluidaSync: builder.mutation<
      RunFluidaSyncResponse,
      { organizationId: string; windowDays?: number }
    >({
      query: ({ organizationId, windowDays }) => ({
        url: "fluida_sync",
        method: "POST",
        params: { organizationId },
        body: windowDays ? { windowDays } : {},
      }),
      invalidatesTags: ["FluidaSync"],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetFluidaSyncStatusQuery,
  useRunFluidaSyncMutation,
  useGetFluidaSyncSettingsQuery,
  useSaveFluidaSyncSettingsMutation,
} = fluidaSyncApi;
