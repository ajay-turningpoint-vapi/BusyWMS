export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'BusyWMS API Documentation',
    description: 'Enterprise Warehouse Management System APIs for BUSY ERP. Documenting authentication, master data, inbound, outbound, stock reservation, picking, packing, dispatch, and ERP synchronization processes.',
    version: '1.0.0'
  },
  servers: [
    {
      url: '/api',
      description: 'Default API path'
    }
  ],
  security: [
    {
      BearerAuth: []
    }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide your JWT access token in the format: `Bearer <token>` in the `Authorization` header.'
      }
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'A human-readable error description.'
          },
          errors: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'Detailed validation error messages.'
          }
        }
      },
      LoginRequest: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: {
            type: 'string',
            example: 'admin',
            description: 'Registered user login name.'
          },
          password: {
            type: 'string',
            example: 'admin123',
            description: 'User password.'
          }
        }
      },
      LoginResponse: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'JWT token to authenticate subsequent requests.'
          },
          user: {
            type: 'object',
            properties: {
              userId: { type: 'integer' },
              username: { type: 'string' },
              fullName: { type: 'string' },
              role: { type: 'string' }
            }
          }
        }
      },
      Supplier: {
        type: 'object',
        properties: {
          SupplierId: { type: 'integer', description: 'Internal primary key ID' },
          Code: { type: 'string', description: 'Unique ERP vendor code' },
          Name: { type: 'string', description: 'Vendor legal name' },
          ContactPerson: { type: 'string' },
          Email: { type: 'string' },
          Phone: { type: 'string' },
          Address: { type: 'string' }
        }
      },
      Customer: {
        type: 'object',
        properties: {
          CustomerId: { type: 'integer', description: 'Internal primary key ID' },
          Code: { type: 'string', description: 'Unique ERP customer code' },
          Name: { type: 'string', description: 'Customer business name' },
          ContactPerson: { type: 'string' },
          Email: { type: 'string' },
          Phone: { type: 'string' },
          Address: { type: 'string' }
        }
      },
      Item: {
        type: 'object',
        properties: {
          ItemId: { type: 'integer', description: 'Internal primary key ID' },
          Code: { type: 'string', description: 'Unique Item SKU code' },
          Name: { type: 'string', description: 'Item name/description' },
          UOM: { type: 'string', description: 'Base unit of measure' },
          UnitCost: { type: 'number', format: 'float' },
          SellingPrice: { type: 'number', format: 'float' }
        }
      },
      PurchaseOrderLineInput: {
        type: 'object',
        required: ['ItemId', 'OrderQty'],
        properties: {
          ItemId: {
            type: 'integer',
            description: 'Internal Item database ID (tblItem.ItemId)',
            example: 1
          },
          OrderQty: {
            type: 'number',
            format: 'float',
            description: 'Quantity ordered. Must be strictly greater than 0.',
            example: 10
          },
          UnitPrice: {
            type: 'number',
            format: 'float',
            description: 'Unit price/cost of the item. Must be greater than or equal to 0. Defaults to 0.0.',
            example: 450.5
          },
          UOM: {
            type: 'string',
            description: 'Unit of measure. If omitted, defaults to the item master UOM.',
            example: 'PCS'
          }
        }
      },
      PurchaseOrderInput: {
        type: 'object',
        required: ['VendorCode', 'VendorName', 'OrderDate', 'Items'],
        properties: {
          POCode: {
            type: 'string',
            description: 'Optional unique PO code. If omitted, will be auto-generated with pattern PO-timestamp.',
            example: 'PO-2026-001'
          },
          VendorCode: {
            type: 'string',
            description: 'Unique vendor identifier code. Must match a supplier code, or be defined as custom.',
            example: 'VEN-001'
          },
          VendorName: {
            type: 'string',
            description: 'Legal name of the vendor.',
            example: 'Acme Supplies Ltd'
          },
          OrderDate: {
            type: 'string',
            format: 'date',
            description: 'Date the order was placed (YYYY-MM-DD).',
            example: '2026-06-27'
          },
          DeliveryDate: {
            type: 'string',
            format: 'date',
            nullable: true,
            description: 'Estimated/expected delivery date (YYYY-MM-DD).',
            example: '2026-07-05'
          },
          Items: {
            type: 'array',
            description: 'Array of purchase order detail lines.',
            items: {
              $ref: '#/components/schemas/PurchaseOrderLineInput'
            }
          }
        }
      },
      PurchaseOrderLineOutput: {
        type: 'object',
        properties: {
          PODetailId: { type: 'integer' },
          POId: { type: 'integer' },
          ItemId: { type: 'integer' },
          ItemCode: { type: 'string' },
          ItemName: { type: 'string' },
          OrderQty: { type: 'number' },
          ReceivedQty: { type: 'number' },
          UOM: { type: 'string' },
          UnitPrice: { type: 'number' }
        }
      },
      PurchaseOrderOutput: {
        type: 'object',
        properties: {
          POId: { type: 'integer' },
          POCode: { type: 'string' },
          VendorCode: { type: 'string' },
          VendorName: { type: 'string' },
          OrderDate: { type: 'string', format: 'date-time' },
          DeliveryDate: { type: 'string', format: 'date-time', nullable: true },
          Status: {
            type: 'string',
            enum: ['PENDING', 'PARTIAL_RECEIVED', 'COMPLETED'],
            description: 'Order status. Can only edit/delete if PENDING.'
          },
          CreatedAt: { type: 'string', format: 'date-time' },
          UpdatedAt: { type: 'string', format: 'date-time' }
        }
      },
      SalesOrderLineInput: {
        type: 'object',
        required: ['ItemId', 'OrderQty'],
        properties: {
          ItemId: {
            type: 'integer',
            description: 'Internal Item database ID (tblItem.ItemId)',
            example: 2
          },
          OrderQty: {
            type: 'number',
            format: 'float',
            description: 'Quantity ordered. Must be strictly greater than 0.',
            example: 5
          },
          UnitPrice: {
            type: 'number',
            format: 'float',
            description: 'Unit selling price of the item. Must be greater than or equal to 0. Defaults to 0.0.',
            example: 799.99
          },
          UOM: {
            type: 'string',
            description: 'Unit of measure. If omitted, defaults to the item master UOM.',
            example: 'PCS'
          }
        }
      },
      SalesOrderInput: {
        type: 'object',
        required: ['CustomerCode', 'CustomerName', 'OrderDate', 'Items'],
        properties: {
          SOCode: {
            type: 'string',
            description: 'Optional unique SO code. If omitted, will be auto-generated with pattern SO-timestamp.',
            example: 'SO-2026-999'
          },
          CustomerCode: {
            type: 'string',
            description: 'Unique customer identifier code.',
            example: 'CUST-009'
          },
          CustomerName: {
            type: 'string',
            description: 'Legal name of the customer.',
            example: 'Reliance Retail Ltd'
          },
          OrderDate: {
            type: 'string',
            format: 'date',
            description: 'Date the sales order was placed (YYYY-MM-DD).',
            example: '2026-06-27'
          },
          Items: {
            type: 'array',
            description: 'Array of sales order detail lines.',
            items: {
              $ref: '#/components/schemas/SalesOrderLineInput'
            }
          }
        }
      },
      SalesOrderLineOutput: {
        type: 'object',
        properties: {
          SODetailId: { type: 'integer' },
          SOId: { type: 'integer' },
          ItemId: { type: 'integer' },
          ItemCode: { type: 'string' },
          ItemName: { type: 'string' },
          OrderQty: { type: 'number' },
          ReservedQty: { type: 'number' },
          PickedQty: { type: 'number' },
          ShippedQty: { type: 'number' },
          UOM: { type: 'string' },
          UnitPrice: { type: 'number' }
        }
      },
      SalesOrderOutput: {
        type: 'object',
        properties: {
          SOId: { type: 'integer' },
          SOCode: { type: 'string' },
          CustomerCode: { type: 'string' },
          CustomerName: { type: 'string' },
          OrderDate: { type: 'string', format: 'date-time' },
          Status: {
            type: 'string',
            enum: ['PENDING', 'PARTIAL_RESERVED', 'RESERVED', 'PICKING', 'PICKED', 'PACKED', 'DISPATCHED'],
            description: 'Sales Order lifecycle state. Can only edit/delete if PENDING.'
          },
          CreatedAt: { type: 'string', format: 'date-time' },
          UpdatedAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  },
  paths: {
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Authenticate User',
        description: 'Authenticates user credentials and returns a Bearer JWT Token along with user profile metadata.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/LoginRequest'
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Successfully authenticated.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/LoginResponse'
                }
              }
            }
          },
          401: {
            description: 'Invalid credentials.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse'
                }
              }
            }
          }
        }
      }
    },
    '/masters/suppliers': {
      get: {
        tags: ['Masters'],
        summary: 'Get Suppliers List',
        description: 'Returns all supplier/vendor records from the database.',
        responses: {
          200: {
            description: 'List of suppliers.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Supplier'
                  }
                }
              }
            }
          }
        }
      }
    },
    '/masters/customers': {
      get: {
        tags: ['Masters'],
        summary: 'Get Customers List',
        description: 'Returns all customer records from the database.',
        responses: {
          200: {
            description: 'List of customers.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Customer'
                  }
                }
              }
            }
          }
        }
      }
    },
    '/masters/items': {
      get: {
        tags: ['Masters'],
        summary: 'Get Items List',
        description: 'Returns all item SKU definitions from the database.',
        responses: {
          200: {
            description: 'List of items.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Item'
                  }
                }
              }
            }
          }
        }
      }
    },
    '/inbound/purchase-orders': {
      get: {
        tags: ['Purchase Order'],
        summary: 'List All Purchase Orders',
        description: 'Retrieves all synced and manually created purchase orders.',
        responses: {
          200: {
            description: 'List of POs.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/PurchaseOrderOutput'
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['Purchase Order'],
        summary: 'Create Manual Purchase Order',
        description: 'Validates and saves a new Purchase Order in the database. Shared validations are run against the payload header and line values.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/PurchaseOrderInput'
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Purchase Order created successfully.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    poId: { type: 'integer' },
                    POCode: { type: 'string' }
                  }
                }
              }
            }
          },
          400: {
            description: 'Validation failed or item mismatch.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse'
                }
              }
            }
          }
        }
      }
    },
    '/inbound/purchase-orders/{poId}': {
      get: {
        tags: ['Purchase Order'],
        summary: 'Get Purchase Order Detail Lines',
        description: 'Retrieves all item detail lines for a specific Purchase Order.',
        parameters: [
          {
            name: 'poId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'Internal PO Database ID'
          }
        ],
        responses: {
          200: {
            description: 'List of PO detail lines.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/PurchaseOrderLineOutput'
                  }
                }
              }
            }
          }
        }
      },
      put: {
        tags: ['Purchase Order'],
        summary: 'Update Purchase Order',
        description: 'Modifies an existing Purchase Order and replaces all details lines. **Restriction:** The order status must be `PENDING`. Updates are locked once warehouse receiving/GRN operations have started.',
        parameters: [
          {
            name: 'poId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'Internal PO Database ID'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/PurchaseOrderInput'
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Purchase Order updated successfully.'
          },
          400: {
            description: 'Validation failed or order is locked (non-pending).'
          },
          404: {
            description: 'Purchase Order not found.'
          }
        }
      },
      delete: {
        tags: ['Purchase Order'],
        summary: 'Delete Purchase Order',
        description: 'Deletes a Purchase Order and its associated detail lines. **Restriction:** The order status must be `PENDING`. Once receiving has started, deletion is blocked.',
        parameters: [
          {
            name: 'poId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'Internal PO Database ID'
          }
        ],
        responses: {
          200: {
            description: 'Purchase Order deleted successfully.'
          },
          400: {
            description: 'Order is locked (non-pending).'
          },
          404: {
            description: 'Purchase Order not found.'
          }
        }
      }
    },
    '/outbound/sales-orders': {
      get: {
        tags: ['Sales Order'],
        summary: 'List All Sales Orders',
        description: 'Retrieves all synced and manually created sales orders.',
        responses: {
          200: {
            description: 'List of SOs.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/SalesOrderOutput'
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['Sales Order'],
        summary: 'Create Manual Sales Order',
        description: 'Validates and saves a new Sales Order in the database. Shared validations are run against the payload header and line values.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SalesOrderInput'
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Sales Order created successfully.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    soId: { type: 'integer' },
                    SOCode: { type: 'string' }
                  }
                }
              }
            }
          },
          400: {
            description: 'Validation failed or item mismatch.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse'
                }
              }
            }
          }
        }
      }
    },
    '/outbound/sales-orders/{soId}': {
      put: {
        tags: ['Sales Order'],
        summary: 'Update Sales Order',
        description: 'Modifies an existing Sales Order and replaces all details lines. **Restriction:** The order status must be `PENDING`. Updates are locked once stock reservation or picking waves have started.',
        parameters: [
          {
            name: 'soId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'Internal SO Database ID'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SalesOrderInput'
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Sales Order updated successfully.'
          },
          400: {
            description: 'Validation failed or order is locked (non-pending).'
          },
          404: {
            description: 'Sales Order not found.'
          }
        }
      },
      delete: {
        tags: ['Sales Order'],
        summary: 'Delete Sales Order',
        description: 'Deletes a Sales Order and its associated detail lines. **Restriction:** The order status must be `PENDING`. Once stock allocation or picking has started, deletion is blocked.',
        parameters: [
          {
            name: 'soId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'Internal SO Database ID'
          }
        ],
        responses: {
          200: {
            description: 'Sales Order deleted successfully.'
          },
          400: {
            description: 'Order is locked (non-pending).'
          },
          404: {
            description: 'Sales Order not found.'
          }
        }
      }
    },
    '/outbound/so-details/{soId}': {
      get: {
        tags: ['Sales Order'],
        summary: 'Get Sales Order Detail Lines',
        description: 'Retrieves all item detail lines, order quantities, and reserved/picked statuses for a specific Sales Order.',
        parameters: [
          {
            name: 'soId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'Internal SO Database ID'
          }
        ],
        responses: {
          200: {
            description: 'List of SO detail lines.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/SalesOrderLineOutput'
                  }
                }
              }
            }
          }
        }
      }
    },
    '/outbound/reserve': {
      post: {
        tags: ['Sales Order'],
        summary: 'Auto Allocate Inventory Reservation',
        description: 'Applies FEFO/FIFO allocation logic to match free warehouse batch stock with pending Sales Order lines, creating active reservation records.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['soId'],
                properties: {
                  soId: { type: 'integer', example: 1 }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Stock reserved successfully.'
          },
          400: {
            description: 'Insufficient stock or invalid order status.'
          }
        }
      }
    },
    '/outbound/release': {
      post: {
        tags: ['Sales Order'],
        summary: 'Release Inventory Reservation',
        description: 'Releases active stock reservations for a Sales Order, restoring stock to unallocated status.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['soId'],
                properties: {
                  soId: { type: 'integer', example: 1 }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Reservation released successfully.'
          }
        }
      }
    },
    '/sync/po': {
      post: {
        tags: ['ERP Synchronization'],
        summary: 'Synchronize Purchase Orders from ERP',
        description: 'Pulls PO queue records from BUSY ERP web services and syncs them to the WMS database. Runs the shared validations and skips invalid entries.',
        responses: {
          200: {
            description: 'Pushed and updated batch success response.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    count: { type: 'integer' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/sync/so': {
      post: {
        tags: ['ERP Synchronization'],
        summary: 'Synchronize Sales Orders from ERP',
        description: 'Pulls Sales Orders from BUSY ERP web services and syncs them to the WMS database. Validation errors will skip/log affected records.',
        responses: {
          200: {
            description: 'Sync complete.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    count: { type: 'integer' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};
