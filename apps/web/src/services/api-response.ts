export type ApiCollectionResponse<T> = T[] | { items: T[] } | { data: T[] | { items: T[] } }

export function readApiCollection<T>(response: ApiCollectionResponse<T>): T[] {
  if (Array.isArray(response)) return response
  if ('items' in response && Array.isArray(response.items)) return response.items
  if ('data' in response && Array.isArray(response.data)) return response.data
  if ('data' in response && response.data && !Array.isArray(response.data) && Array.isArray(response.data.items))
    return response.data.items
  throw new Error('API response does not contain a collection')
}
