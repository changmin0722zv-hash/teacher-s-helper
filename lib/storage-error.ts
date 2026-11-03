export class StorageError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function storageFailure(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  if (error instanceof Error && error.message.includes("TEACHING_CONFLICT"))
    return new StorageError(
      409,
      "다른 곳에서 변경된 내용이 있습니다. 최신 내용을 불러온 뒤 다시 저장해 주세요.",
    );
  return new StorageError(
    503,
    "클라우드 저장소에 연결하지 못했습니다. 연결 설정을 확인하고 다시 시도해 주세요. 미저장 내용을 보존해 주세요.",
  );
}
