'use strict';

const { contactViewRepository, listingRepository } = require('../repositories');
const ApiError = require('../utils/ApiError');
const { STAFF_ROLES } = require('../constants');

class ContactViewService {
  /** Shape the owner's revealable contact details from a populated listing. */
  contactOf(listing) {
    return {
      fullName: listing.owner?.fullName,
      mobile: listing.owner?.mobile,
      phone: listing.contact?.phone,
      whatsapp: listing.contact?.whatsapp,
      person: listing.contact?.person,
    };
  }

  /**
   * Whether `viewer` has already revealed this listing's contact (owners always
   * have). Returns the contact details when already viewed so the client can
   * show them straight away without re-prompting.
   */
  async statusFor(listingId, viewer) {
    const listing = await listingRepository
      .findById(listingId)
      .populate('owner', 'fullName mobile');
    if (!listing) throw ApiError.notFound('Listing not found');

    const ownerId = listing.owner?._id || listing.owner;
    const isOwner = String(ownerId) === String(viewer._id);
    const viewed = isOwner
      ? true
      : Boolean(await contactViewRepository.findOne({ listing: listingId, viewer: viewer._id }));

    return { viewed, contact: viewed ? this.contactOf(listing) : null };
  }

  /**
   * Record that `viewer` revealed this listing's contact details and return the
   * contact info. The owner viewing their own listing is never counted. Repeat
   * reveals by the same user are de-duplicated by the unique (listing, viewer)
   * index, so the analytics count reflects distinct people.
   */
  async record(listingId, viewer) {
    const listing = await listingRepository
      .findById(listingId)
      .populate('owner', 'fullName mobile');
    if (!listing) throw ApiError.notFound('Listing not found');

    const ownerId = listing.owner?._id || listing.owner;
    const isOwner = String(ownerId) === String(viewer._id);
    if (!isOwner) {
      await contactViewRepository.model.updateOne(
        { listing: listingId, viewer: viewer._id },
        { $setOnInsert: { listing: listingId, viewer: viewer._id } },
        { upsert: true },
      );
    }

    return { contact: this.contactOf(listing) };
  }

  /**
   * List the users who viewed a listing's contact, newest first. Restricted to
   * the listing's owner or staff. Returns { count, viewers: [{ name, image }] }.
   */
  async listViewers(listingId, requester) {
    const listing = await listingRepository.findById(listingId);
    if (!listing) throw ApiError.notFound('Listing not found');

    const isOwner = String(listing.owner) === String(requester._id);
    const isStaff = STAFF_ROLES.includes(requester.role);
    if (!isOwner && !isStaff) {
      throw ApiError.forbidden('You can only view analytics for your own listings');
    }

    const views = await contactViewRepository.find(
      { listing: listingId },
      {
        sort: { createdAt: -1 },
        limit: 500,
        populate: { path: 'viewer', select: 'fullName profileImage' },
      },
    );

    const viewers = views
      .filter((v) => v.viewer)
      .map((v) => ({
        _id: v.viewer._id,
        fullName: v.viewer.fullName || 'User',
        profileImage: v.viewer.profileImage || null,
        viewedAt: v.createdAt,
      }));

    return { count: viewers.length, viewers };
  }
}

module.exports = new ContactViewService();
