"""The shared kernel, in the DDD sense: the small part of the domain model every context agrees
on. Two things today, an ``Email`` and the ``Role``s; the published contracts between contexts
are next door, in the shared kernel's Application layer.

This package imports the building blocks' Domain and nothing else (ARCH-TREES): it is
vocabulary built on mechanics, and no context's.
"""

from shared_kernel.domain.email import Email
from shared_kernel.domain.role import Role

__all__ = ["Email", "Role"]
