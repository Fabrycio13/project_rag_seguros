-- Migration: D1 - Hybrid search function for vector similarity

CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE(
  chunk_id uuid,
  document_id uuid,
  content_clean text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.chunk_id,
    dc.document_id,
    dc.content_clean,
    dc.metadata,
    1 - (ce.embedding_content <=> query_embedding) AS similarity
  FROM chunk_embeddings ce
  INNER JOIN document_chunks dc ON ce.chunk_id = dc.id
  WHERE 1 - (ce.embedding_content <=> query_embedding) > match_threshold
  ORDER BY ce.embedding_content <=> query_embedding
  LIMIT match_count;
END;
$$;