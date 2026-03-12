from __future__ import annotations

import hashlib

import schemathesis


def _payload_binario_descritivo(content_type: str, content: bytes) -> dict[str, object]:
    return {
        "content_type": content_type,
        "size_bytes": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
    }


@schemathesis.deserializer("application/pdf")
def _deserialize_pdf(_ctx, response):
    return _payload_binario_descritivo("application/pdf", response.content)


@schemathesis.deserializer("application/octet-stream")
def _deserialize_octet_stream(_ctx, response):
    return _payload_binario_descritivo("application/octet-stream", response.content)


@schemathesis.deserializer("image/png", "image/jpeg", "image/webp")
def _deserialize_image(_ctx, response):
    return _payload_binario_descritivo(response.headers.get("content-type", "image/*"), response.content)
