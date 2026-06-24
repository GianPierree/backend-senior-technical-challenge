export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  total: number;
  page: number;
  pageSize: number;
  data: T[];
}
