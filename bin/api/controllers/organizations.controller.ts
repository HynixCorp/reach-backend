import { Request, Response } from "express";
import { createGenericResponse, createSuccessResponse } from "../../common/utils";
import { generateTemporaryToken } from "../../common/cryptography/temporal";
import { generateToken } from "../../common/reach/x-reach";
import { DateTime } from "luxon";
import { verifyTokenDate } from "../../common/reach/orgs.provider";
import { getDevelopersDB } from "../../common/services/database.service";
import { validateRequiredFields, validateRequest, isValidObjectId } from "../../common/services/validation.service";
import { ResponseHandler } from "../../common/services/response.service";
import { logger } from "../../common/services/logger.service";

// reach_developers - Organizations belong to developer accounts
const DEVELOPERS_DB = getDevelopersDB();

type OrganizationMemberEntry =
  | string
  | { userId: string; role: string };

const normalizeMembers = (
  members: OrganizationMemberEntry[],
  ownerId: string
) =>
  members.map((member) =>
    typeof member === "string"
      ? { userId: member, role: member === ownerId ? "owner" : "member" }
      : member
  );

const memberMatchesUser = (member: OrganizationMemberEntry, userId: string) =>
  typeof member === "string" ? member === userId : member.userId === userId;

export async function create_organization(req: Request, res: Response) {
  const validation = validateRequiredFields(req.body, [
    "name",
    "description",
    "supportEmail",
    "supportWebsite",
    "ownerId"
  ]);
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { name, description, supportEmail, supportWebsite, ownerId } = req.body;

  const nameExistes = await DEVELOPERS_DB.findDocuments("organizations", { name });

  if (nameExistes.length > 0) {
    return ResponseHandler.conflict(
      res,
      "Name already exists. Please use a different name or contact support."
    );
  }

  const organizationPackage = {
    name,
    description,
    supportEmail,
    supportWebsite,
    ownerId,
    members: [{ userId: ownerId, role: "owner" }],
    assets: {
      logo: null,
      banner: null,
    },
  };

  await DEVELOPERS_DB.insertDocument("organizations", organizationPackage);

  return res
    .status(200)
    .json(
      createSuccessResponse(
        organizationPackage,
        "Organization created successfully."
      )
    );
}

export async function update_organization_assets(req: Request, res: Response) {
  const { organizationId } = req.body;
  const { logo, banner } = req.files as {
    [fieldname: string]: Express.Multer.File[];
  };
}

export async function create_organization_link(req: Request, res: Response) {
  try {
    const validation = validateRequest(req, {
      requiredBody: ["organizationId", "ownerId"],
      requiredHeaders: ["x-reach-token"]
    });
    
    if (!validation.isValid) {
      return ResponseHandler.validationError(res, validation.errors);
    }

    const { organizationId, ownerId } = req.body;
    const x_reach_token = req.headers["x-reach-token"] as string;

    const isValid = generateToken(ownerId) === x_reach_token;

    if (!isValid) {
      return ResponseHandler.forbidden(res, "Invalid header. Access denied.");
    }

    const organizationByOwner = await DEVELOPERS_DB.findDocuments("organizations", {
      ownerId: ownerId,
    });

    if (organizationByOwner.length === 0) {
      return ResponseHandler.notFound(res, "Organization by owner");
    }

    const organization = organizationByOwner.find(
      (org: any) => org._id.toString() === organizationId
    );

    const temporaryToken = await generateTemporaryToken(
      organization._id.toString()
    );

    const url = `${process.env.DASHBOARD_URL}/api/organizations/join?key=${temporaryToken}`;

    const allNewPackage = {
      organizationId,
      ownerId,
      date: new Date(),
      expirationDate: new Date(Date.now() + 1000 * 60 * 60 * 24), // 1 day
      temporaryToken,
    };

    await DEVELOPERS_DB.insertDocument("organizationLinks", allNewPackage);

    return res.status(200).json(
      createSuccessResponse(
        {
          ...allNewPackage,
          url,
        },
        "Organization link created successfully."
      )
    );
  } catch (error) {
    logger.error("Organizations", `${error}`);
    return ResponseHandler.serverError(res, error as Error);
  }
}

export async function get_organization_info_by_id(req: Request, res: Response) {
  const validation = validateRequest(req, {
    requiredParams: ["organizationId", "executor"]
  });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { organizationId, executor } = req.params;

  if (!isValidObjectId(organizationId)) {
    return ResponseHandler.badRequest(res, "Invalid organization ID format.");
  }

  const organization = await DEVELOPERS_DB.findDocuments("organizations", {
    _id: DEVELOPERS_DB.createObjectId(organizationId),
  });

  if (organization.length === 0) {
    return ResponseHandler.notFound(res, "Organization");
  }

  let packet;

  if (executor === "invite") {
    packet = {
      name: organization[0].name,
      description: organization[0].description,
      supportEmail: organization[0].supportEmail,
    };
  } else if (executor === "dashboard") {
    packet = organization[0];
  } else {
    return ResponseHandler.badRequest(res, "Invalid executor type.");
  }

  return res
    .status(200)
    .json(
      createSuccessResponse(packet, "Organization retrieved successfully.")
    );
}

export async function get_organization_info_by_tk(req: Request, res: Response) {
  const validation = validateRequest(req, { requiredParams: ["key"] });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { key } = req.params;

  const packageLink = await DEVELOPERS_DB.findDocuments("organizationLinks", {
    temporaryToken: key as string,
  });

  if (packageLink.length === 0) {
    return ResponseHandler.notFound(res, "Organization link (expired or not found)");
  }

  const organizationId = packageLink[0].organizationId;
  const organization = await DEVELOPERS_DB.findDocuments("organizations", {
    _id: DEVELOPERS_DB.createObjectId(organizationId),
  });

  if (organization.length === 0) {
    return ResponseHandler.notFound(res, "Organization");
  }

  return res.status(200).json(
    createSuccessResponse(
      {
        name: organization[0].name,
        description: organization[0].description,
        supportEmail: organization[0].supportEmail,
        supportWebsite: organization[0].supportWebsite,
        ownerId: organization[0].ownerId,
      },
      "Organization retrieved successfully."
    )
  );
}

export async function join_organization(req: Request, res: Response) {
  const validation = validateRequest(req, { requiredBody: ["key", "userId"] });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { key, userId } = req.body;

  const packageLink = await DEVELOPERS_DB.findDocuments("organizationLinks", {
    temporaryToken: key as string,
  });

  if (packageLink.length === 0) {
    return ResponseHandler.notFound(res, "Organization link (expired or not found)");
  }

  const tokenDate = DateTime.fromISO(packageLink[0].createdAt);
  const isTokenValid = await verifyTokenDate(tokenDate);

  if (!isTokenValid) {
    return ResponseHandler.badRequest(res, "Link has expired. Please request a new link.");
  }

  const organizationId = packageLink[0].organizationId;
  const organization = await DEVELOPERS_DB.findDocuments("organizations", {
    _id: DEVELOPERS_DB.createObjectId(organizationId),
  });

  if (organization.length === 0) {
    return ResponseHandler.notFound(res, "Organization");
  }

  const currentMembers = (organization[0].members ?? []) as OrganizationMemberEntry[];

  if (currentMembers.some((member) => memberMatchesUser(member, userId))) {
    return res.status(200).json(
      createGenericResponse(
        false,
        null,
        "User is already a member of the organization.",
        400
      )
    );
  }

  await DEVELOPERS_DB.updateDocument(
    "organizations",
    { _id: DEVELOPERS_DB.createObjectId(organizationId) },
    { $push: { members: { userId, role: "member" } } }
  );

  await DEVELOPERS_DB.deleteDocument("organizationLinks", {
    temporaryToken: key as string,
  });

  return res.status(200).json(
    createSuccessResponse(null, "User added to organization successfully.")
  );
}

export async function decline_invite(req: Request, res: Response) {
  const validation = validateRequest(req, { requiredBody: ["key"] });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { key } = req.body;

  const packageLink = await DEVELOPERS_DB.findDocuments("organizationLinks", {
    temporaryToken: key as string,
  });

  if (packageLink.length === 0) {
    return res.status(200).json(
      createGenericResponse(true, null, "Already declined or expired.", 200)
    );
  }

  const tokenDate = DateTime.fromISO(packageLink[0].createdAt);
  const isTokenValid = await verifyTokenDate(tokenDate);

  if (!isTokenValid) {
    return res.status(200).json(
      createGenericResponse(true, null, "Link has expired. Please request a new link.", 200)
    );
  }

  await DEVELOPERS_DB.deleteDocument("organizationLinks", {
    temporaryToken: key as string,
  });

  return res.status(200).json(
    createSuccessResponse(null, "Invite declined successfully.")
  );
}

export async function get_organizations_by_user(req: Request, res: Response) {
  const validation = validateRequest(req, { requiredParams: ["userId"] });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { userId } = req.params;

  const organizations = await DEVELOPERS_DB.findDocuments("organizations", {
    $or: [
      { members: { $elemMatch: { userId } } },
      { members: userId },
    ],
  });

  if (organizations.length === 0) {
    return res.status(404).json(
      createGenericResponse(true, null, "No organizations found for this user.", 404)
    );
  }

  const organizationsWithoutMembers = organizations.map((org: any) => {
    const { members, ownerId, ...rest } = org;
    return {
      ...rest,
      name: org.name.replace(/\b\w/g, (char: string) => char.toUpperCase()),
    };
  });

  return res.status(200).json(
    createSuccessResponse(organizationsWithoutMembers, "Organizations retrieved successfully.")
  );
}

export async function get_all_info_organization(req: Request, res: Response) {
  const validation = validateRequest(req, {
    requiredQuery: ["organizationId"],
    requiredHeaders: ["x-reach-token"],
  });

  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { organizationId } = req.query;
  const x_reach_token = req.headers["x-reach-token"];

  const organization = await DEVELOPERS_DB.findDocuments("organizations", {
    _id: DEVELOPERS_DB.createObjectId(organizationId as string),
  });

  if (organization.length === 0) {
    return ResponseHandler.notFound(res, "Organization");
  }

  const isValid = generateToken(organization[0].ownerId) === x_reach_token;

  if (!isValid) {
    return ResponseHandler.forbidden(res, "Invalid X-Reach-Token. Access denied.");
  }

  const existingMembers = (organization[0].members ?? []) as OrganizationMemberEntry[];
  const normalizedMembers = normalizeMembers(existingMembers, organization[0].ownerId);

  const membersList = normalizedMembers.map((member) =>
    DEVELOPERS_DB.findDocuments("user", {
      _id: DEVELOPERS_DB.createObjectId(member.userId),
    })
  );

  const membersInfo = await Promise.all(membersList);
  const organizationInvites = await DEVELOPERS_DB.findDocuments(
    "organizationLinks",
    { organizationId: organizationId as string }
  );

  organization[0].members = normalizedMembers;
  organization[0].membersInfo = membersInfo
    .map((memberArray, index) => {
      const memberDocument = memberArray[0];
      if (!memberDocument) return null;
      return {
        ...memberDocument,
        role: normalizedMembers[index]?.role ?? "member",
      };
    })
    .filter((member): member is Record<string, unknown> => member !== null);
  organization[0].organizationInvites = organizationInvites;

  return res.status(200).json(
    createSuccessResponse(organization[0], "Organization retrieved successfully.")
  );
}

export async function renew_organization_link(req: Request, res: Response) {
  const validation = validateRequest(req, { requiredBody: ["key"] });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { key } = req.body;

  const packageLink = await DEVELOPERS_DB.findDocuments("organizationLinks", {
    temporaryToken: key as string,
  });

  if (packageLink.length === 0) {
    return ResponseHandler.notFound(res, "Organization link");
  }

  const { organizationId } = packageLink[0];
  const newTemporaryToken = await generateTemporaryToken(organizationId.toString());

  await DEVELOPERS_DB.updateDocument(
    "organizationLinks",
    { temporaryToken: key as string },
    {
      $set: {
        temporaryToken: newTemporaryToken,
        date: new Date(),
        expirationDate: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    }
  );

  return res.status(200).json(
    createSuccessResponse(
      {
        temporaryToken: newTemporaryToken,
        previousToken: key,
        newExpirationDate: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
      "Organization link renewed successfully."
    )
  );
}

export async function revoke_organization_link(req: Request, res: Response) {
  const validation = validateRequest(req, { requiredBody: ["key"] });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { key } = req.body;

  const packageLink = await DEVELOPERS_DB.findDocuments("organizationLinks", {
    temporaryToken: key as string,
  });

  if (packageLink.length === 0) {
    return ResponseHandler.notFound(res, "Organization link");
  }

  await DEVELOPERS_DB.deleteDocument("organizationLinks", {
    temporaryToken: key as string,
  });

  return res.status(200).json(
    createSuccessResponse(null, "Organization link revoked successfully.")
  );
}

export async function delete_member_from_organization(req: Request, res: Response) {
  const validation = validateRequest(req, { requiredBody: ["organizationId", "memberId"] });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { organizationId, memberId } = req.body;

  const organization = await DEVELOPERS_DB.findDocuments("organizations", {
    _id: DEVELOPERS_DB.createObjectId(organizationId),
  });

  if (organization.length === 0) {
    return ResponseHandler.notFound(res, "Organization");
  }

  const currentMembers = (organization[0].members ?? []) as OrganizationMemberEntry[];

  if (!currentMembers.some((member) => memberMatchesUser(member, memberId))) {
    return ResponseHandler.badRequest(res, "Member not found in organization.");
  }

  await DEVELOPERS_DB.updateDocument(
    "organizations",
    { _id: DEVELOPERS_DB.createObjectId(organizationId) },
    { $pull: { members: { userId: memberId } } }
  );

  await DEVELOPERS_DB.updateDocument(
    "organizations",
    { _id: DEVELOPERS_DB.createObjectId(organizationId) },
    { $pull: { members: memberId } }
  );

  return res.status(200).json(
    createSuccessResponse(null, "Member removed from organization successfully.")
  );
}

export async function edit_organization_info(req: Request, res: Response) {
  const { organizationId, description, supportEmail, supportWebsite } = req.body;

  const validation = validateRequiredFields(req.body, [
    "organizationId",
    "description",
    "supportEmail",
    "supportWebsite",
  ]);
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  await DEVELOPERS_DB.updateDocument("organizations", {
    _id: DEVELOPERS_DB.createObjectId(organizationId),
  }, {
    $set: {
      description,
      supportEmail,
      supportWebsite,
    },
  });

  return res
    .status(200)
    .json(
      createSuccessResponse(null, "Organization information updated successfully.")
    );
}
