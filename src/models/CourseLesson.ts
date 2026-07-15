import mongoose, { Schema, Document } from 'mongoose'

export interface ICourseLesson extends Document {
  pageId: string
  pageName: string
  moduleId: string
  moduleName: string
  moduleSequence: number
  lessonSequence: number
  courseCode: string
  productId?: mongoose.Types.ObjectId
  url: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const CourseLessonSchema = new Schema<ICourseLesson>({
  pageId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  pageName: {
    type: String,
    required: true,
    trim: true
  },
  moduleId: {
    type: String,
    default: '',
    trim: true
  },
  moduleName: {
    type: String,
    required: true,
    trim: true
  },
  moduleSequence: {
    type: Number,
    required: true,
    default: 0
  },
  lessonSequence: {
    type: Number,
    required: true,
    default: 0
  },
  courseCode: {
    type: String,
    required: true,
    default: 'OGI',
    index: true,
    trim: true
  },
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product'
  },
  url: {
    type: String,
    default: '',
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'courseLessons'
})

CourseLessonSchema.index({ moduleSequence: 1, lessonSequence: 1 })

const CourseLesson: mongoose.Model<ICourseLesson> = mongoose.models.CourseLesson || mongoose.model<ICourseLesson>('CourseLesson', CourseLessonSchema)

export default CourseLesson
