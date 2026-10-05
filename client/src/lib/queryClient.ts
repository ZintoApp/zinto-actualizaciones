import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { reportTourResponse } from '@/components/guided-tours/signals';

/** Zod flatten-style payload often returned as `details` with validation errors. */
function formatValidationDetailsForMessage(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }
  const d = details as { formErrors?: unknown; fieldErrors?: unknown };
  const parts: string[] = [];
  if (Array.isArray(d.formErrors)) {
    for (const e of d.formErrors) {
      if (typeof e === "string" && e.trim()) {
        parts.push(e.trim());
      }
    }
  }
  if (
    d.fieldErrors &&
    typeof d.fieldErrors === "object" &&
    !Array.isArray(d.fieldErrors)
  ) {
    for (const [field, msgs] of Object.entries(
      d.fieldErrors as Record<string, unknown>,
    )) {
      if (Array.isArray(msgs) && msgs.length) {
        const text = msgs
          .filter((m): m is string => typeof m === "string" && !!m.trim())
          .join("; ");
        if (text) {
          parts.push(`${field}: ${text}`);
        }
      }
    }
  }
  if (!parts.length) {
    return null;
  }
  return parts.join(", ");
}

function mergeValidationDetailsIntoMessage(
  errorMessage: string,
  details: unknown,
): string {
  const detailSummary = formatValidationDetailsForMessage(details);
  if (!detailSummary) {
    return errorMessage;
  }
  if (errorMessage === "Validation failed") {
    return `Validation failed: ${detailSummary}`;
  }
  if (!errorMessage.includes(detailSummary)) {
    return `${errorMessage} — ${detailSummary}`;
  }
  return errorMessage;
}

/** Prefer actionable string `details` (e.g. pgvector/Pinecone setup guidance). */
function resolveJsonErrorMessage(jsonData: Record<string, unknown>): string {
  let errorMessage = "Request failed";

  if (typeof jsonData.message === "string" && jsonData.message) {
    errorMessage = jsonData.message;
  } else if (jsonData.error !== undefined) {
    errorMessage =
      typeof jsonData.error === "string"
        ? jsonData.error
        : JSON.stringify(jsonData.error);
  }

  if (typeof jsonData.details === "string" && jsonData.details.trim()) {
    return jsonData.details.trim();
  }

  return mergeValidationDetailsIntoMessage(errorMessage, jsonData.details);
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Clone the response to read it without consuming the original
    const clonedRes = res.clone();
    let errorMessage = res.statusText;
    let errorCodeFromJson: string | undefined;
    let errorParamsFromJson: Record<string, string> | undefined;

    try {
      // Attempt to parse the response body as JSON
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const jsonData = await clonedRes.json();
        if (typeof jsonData.errorCode === 'string' || typeof jsonData.code === 'string') {
          errorCodeFromJson = String(jsonData.errorCode || jsonData.code);
        }
        if (
          jsonData.errorParams &&
          typeof jsonData.errorParams === 'object' &&
          !Array.isArray(jsonData.errorParams)
        ) {
          errorParamsFromJson = jsonData.errorParams as Record<string, string>;
        }
        errorMessage = resolveJsonErrorMessage(jsonData);
      } else {
        // Fall back to text if not JSON
        const text = await clonedRes.text();
        if (text) {
          errorMessage = text;
        }
      }
    } catch (parseError) {
      // If JSON parsing fails, fall back to text/status message
      try {
        const text = await clonedRes.text();
        if (text) {
          errorMessage = text;
        }
      } catch (textError) {
        // If text parsing also fails, use statusText
        errorMessage = res.statusText;
      }
    }

    const error = new Error(`${res.status}: ${errorMessage}`) as Error & {
      status?: number;
      errorCode?: string;
      errorParams?: Record<string, string>;
      isAuthError?: boolean;
      suppressConsoleError?: boolean;
    };
    error.status = res.status;
    if (errorCodeFromJson) {
      error.errorCode = errorCodeFromJson;
    }
    if (errorParamsFromJson) {
      error.errorParams = errorParamsFromJson;
    }

    if (res.status === 401) {
      error.isAuthError = true;
      error.suppressConsoleError = true;
    }

    throw error;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {

  const isFormData = data instanceof FormData;

  const res = await fetch(url, {
    method,
    headers: data && !isFormData ? { "Content-Type": "application/json" } : {},
    body: isFormData ? data : (data ? JSON.stringify(data) : undefined),
    credentials: "include",
  });

  await throwIfResNotOk(res);
  await reportTourResponse(method, url, res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
      signal,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }


    if (res.status === 503) {
      try {
        const data = await res.json();
        if (data.maintenanceMode) {

          if (window.location.pathname !== '/maintenance') {
            window.location.href = '/maintenance';
          }
          throw new Error('System is under maintenance');
        }
      } catch (parseError) {

      }
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 60 * 1000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
