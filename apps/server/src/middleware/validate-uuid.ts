import { createMiddleware } from 'hono/factory';
import { AppError, ErrorCodes } from '@geometrix/contract';

/**
 * UUID Validation Regex
 * Matches standard UUID v4 format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate UUID Path Parameter Middleware
 *
 * Validates that a named path parameter is a valid UUID.
 * Returns 400 Bad Request if the parameter is missing or invalid.
 *
 * @param paramName - The name of the path parameter to validate (default: 'id')
 *
 * @example
 * ```typescript
 * // Validates :id parameter
 * router.get('/:id', validateUuidParam(), async (c) => { ... })
 *
 * // Validates :userId parameter
 * router.get('/users/:userId', validateUuidParam('userId'), async (c) => { ... })
 * ```
 */
export const validateUuidParam = (paramName: string = 'id') => {
  return createMiddleware(async (c, next) => {
    const value = c.req.param(paramName);

    if (!value) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `Missing required parameter: ${paramName}`,
        400
      );
    }

    if (!UUID_REGEX.test(value)) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `Invalid UUID format for parameter: ${paramName}`,
        400
      );
    }

    await next();
  });
};

/**
 * Validate multiple UUID path parameters
 *
 * @param paramNames - Array of parameter names to validate
 *
 * @example
 * ```typescript
 * router.get('/orgs/:orgId/users/:userId', validateUuidParams(['orgId', 'userId']), ...)
 * ```
 */
export const validateUuidParams = (paramNames: string[]) => {
  return createMiddleware(async (c, next) => {
    for (const paramName of paramNames) {
      const value = c.req.param(paramName);

      if (!value) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          `Missing required parameter: ${paramName}`,
          400
        );
      }

      if (!UUID_REGEX.test(value)) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          `Invalid UUID format for parameter: ${paramName}`,
          400
        );
      }
    }

    await next();
  });
};
